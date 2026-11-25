namespace foregroundStencil {
namespace {

constexpr size_t CommandCapacity = 4096;
constexpr uint8_t SkipCommand = 0xff;
using Item = BaseRenderer::StageItem;

struct Key {
    const MaskDraw* draw = nullptr;
    const void* texture = nullptr;
    uint32_t threshold = 0;
    size_t program = 0;
    size_t defines = 0;
};

struct Slot {
    Key key;
    size_t lastUse = 0;
    uint8_t bit = 0;
};

struct StagePlan {
    const Item* items = nullptr;
    size_t count = 0;
    uint8_t replacements[CommandCapacity];
};

thread_local StagePlan plan;

struct StageScope {
    ~StageScope() { plan.items = nullptr; }
};

const size_t AlphaThresholdHash = std::hash<std::string>{}("alphaThreshold");
const size_t TextureHash = std::hash<std::string>{}("texture");

bool isQuad(const Item& item)
{
    return item.ia && item.ia->getPrimitiveType() == PrimitiveType::TRIANGLES &&
        item.ia->getIndexBuffer() && item.ia->getCount() == 6 && item.passes.size() == 1;
}

bool stockStencilState(const Pass& pass, StencilFunc func, StencilOp fail)
{
    return pass.isStencilTest() && !pass.isDepthWrite() && pass.getCullMode() == CullMode::NONE &&
        pass.getStencilFuncFront() == func && pass.getStencilFuncBack() == func &&
        pass.getStencilRefFront() == 1 && pass.getStencilRefBack() == 1 &&
        pass.getStencilMaskFront() == 1 && pass.getStencilMaskBack() == 1 &&
        pass.getStencilWriteMaskFront() == 1 && pass.getStencilWriteMaskBack() == 1 &&
        pass.getStencilFailOpFront() == fail && pass.getStencilFailOpBack() == fail &&
        pass.getStencilZFailOpFront() == StencilOp::KEEP && pass.getStencilZFailOpBack() == StencilOp::KEEP &&
        pass.getStencilZPassOpFront() == StencilOp::KEEP && pass.getStencilZPassOpBack() == StencilOp::KEEP;
}

uint8_t usedStencilBits(const Pass& pass)
{
    if (!pass.isStencilTest()) return 0;
    uint8_t bits = 0;
    for (bool front : {false, true}) {
        const auto func = front ? pass.getStencilFuncFront() : pass.getStencilFuncBack();
        if (func != StencilFunc::NEVER && func != StencilFunc::ALWAYS)
            bits |= front ? pass.getStencilMaskFront() : pass.getStencilMaskBack();
        if ((front ? pass.getStencilFailOpFront() : pass.getStencilFailOpBack()) != StencilOp::KEEP ||
            (front ? pass.getStencilZFailOpFront() : pass.getStencilZFailOpBack()) != StencilOp::KEEP ||
            (front ? pass.getStencilZPassOpFront() : pass.getStencilZPassOpBack()) != StencilOp::KEEP)
            bits |= front ? pass.getStencilWriteMaskFront() : pass.getStencilWriteMaskBack();
    }
    return bits;
}

bool maskKey(const MaskDraw& draw, const Item* items, Key& key)
{
    const auto& clear = items[0];
    const auto& writer = items[1];
    const auto& paint = items[2];
    if (clear.model != draw.clear || writer.model != draw.writer || paint.model != draw.paint ||
        !isQuad(clear) || !isQuad(writer) || !isQuad(paint) ||
        static_cast<uint32_t>(clear.model->getCullingMask()) != draw.cullingMask ||
        static_cast<uint32_t>(writer.model->getCullingMask()) != draw.cullingMask ||
        static_cast<uint32_t>(paint.model->getCullingMask()) != draw.cullingMask) return false;

    const auto& clearPass = *clear.passes[0];
    const auto& writePass = *writer.passes[0];
    const auto& paintPass = *paint.passes[0];
    if (!stockStencilState(clearPass, StencilFunc::NEVER, StencilOp::ZERO) ||
        !stockStencilState(writePass, StencilFunc::NEVER, StencilOp::REPLACE) ||
        !stockStencilState(paintPass, StencilFunc::EQUAL, StencilOp::KEEP) ||
        clearPass.getProgramName().find("clear-stencil") == std::string::npos ||
        writePass.getProgramName().find("2d-sprite") == std::string::npos ||
        paintPass.getProgramName().find("OcclusionSilhouette") == std::string::npos) return false;

    const auto* texture = writePass.getProperty(TextureHash);
    const auto* threshold = writePass.getProperty(AlphaThresholdHash);
    if (!texture || texture->getType() != Technique::Parameter::Type::TEXTURE_2D || texture->getCount() != 1 ||
        !texture->getValue() || !threshold || threshold->getType() != Technique::Parameter::Type::FLOAT ||
        threshold->getBytes() != sizeof(float) || !threshold->getValue()) return false;
    key.draw = &draw;
    key.texture = texture->getValue();
    std::memcpy(&key.threshold, threshold->getValue(), sizeof(key.threshold));
    key.program = writePass.getHashName();
    key.defines = writePass.getDefinesHash();
    return true;
}

bool sameKey(const Key& a, const Key& b)
{
    return a.draw && a.draw->source == b.draw->source && a.draw->cullingMask == b.draw->cullingMask &&
        a.texture == b.texture && a.threshold == b.threshold && a.program == b.program && a.defines == b.defines &&
        a.draw->vertexBytes == b.draw->vertexBytes &&
        !std::memcmp(a.draw->vertices, b.draw->vertices, a.draw->vertexBytes) &&
        !std::memcmp(a.draw->indices, b.draw->indices, QuadIndexBytes);
}

bool usesStencil(const Item& item)
{
    for (const auto* pass : item.passes) {
        if (pass->isStencilTest()) return true;
    }
    return false;
}

void planStage(const std::vector<Item>& items, uint32_t cullingMask)
{
    uint32_t drawCount;
    const auto* recorded = draws(drawCount);
    if (!drawCount || items.size() > CommandCapacity) return;

    GLint stencilBits = 0;
    glGetIntegerv(GL_STENCIL_BITS, &stencilBits);
    if (stencilBits < 2) return;
    uint8_t reserved = 1;
    for (const auto& item : items)
        for (const auto* pass : item.passes)
            reserved |= usedStencilBits(*pass);

    Slot slots[7];
    size_t slotCount = 0;
    for (int bit = 1; bit < stencilBits && bit < 8; ++bit) {
        const auto bitMask = static_cast<uint8_t>(1u << bit);
        if (!(reserved & bitMask)) slots[slotCount++].bit = bitMask;
    }
    if (!slotCount) return;

    std::memset(plan.replacements, 0, items.size());
    uint32_t next = 0;
    size_t hitCount = 0;
    size_t lastSkipped = CommandCapacity;
    auto restoreStockBit = [&] {
        if (lastSkipped == CommandCapacity) return;
        plan.replacements[lastSkipped] = 0;
        plan.replacements[lastSkipped + 1] = 0;
        plan.replacements[lastSkipped + 2] = 0;
        --hitCount;
        lastSkipped = CommandCapacity;
    };

    for (size_t i = 0; i < items.size(); ++i) {
        while (next < drawCount && !(recorded[next].cullingMask & cullingMask)) ++next;
        if (next >= drawCount || items[i].model != recorded[next].clear) {
            if (usesStencil(items[i])) restoreStockBit();
            continue;
        }
        const auto& candidate = recorded[next++];
        Key key;
        if (i + 2 >= items.size() || !maskKey(candidate, &items[i], key)) {
            restoreStockBit();
            continue;
        }

        Slot* selected = &slots[0];
        bool hit = false;
        for (size_t slot = 0; slot < slotCount; ++slot) {
            auto& current = slots[slot];
            if (sameKey(current.key, key)) {
                selected = &current;
                hit = true;
                break;
            }
            if (current.lastUse < selected->lastUse) selected = &current;
        }
        selected->lastUse = i + 1;
        if (hit) {
            plan.replacements[i] = SkipCommand;
            plan.replacements[i + 1] = SkipCommand;
            plan.replacements[i + 2] = selected->bit;
            ++hitCount;
            lastSkipped = i;
        } else {
            // Keep the stock writes while populating the spare bit from the
            // same raster operation. Later paints use its cached result.
            selected->key = key;
            plan.replacements[i] = 1 | selected->bit;
            plan.replacements[i + 1] = 1 | selected->bit;
            lastSkipped = CommandCapacity;
        }
        i += 2;
    }

    // Restore bit zero before any foreign stencil draw and at view exit.
    // The extra bits are scratch and no stock pass in this view uses them.
    restoreStockBit();
    if (!hitCount) return;
    plan.items = items.data();
    plan.count = items.size();
}

uint8_t replacement(const Item& item)
{
    if (!plan.items) return 0;
    const auto target = reinterpret_cast<uintptr_t>(&item);
    const auto base = reinterpret_cast<uintptr_t>(plan.items);
    if (target < base) return 0;
    const auto offset = target - base;
    if (offset % sizeof(Item) || offset / sizeof(Item) >= plan.count) return 0;
    return plan.replacements[offset / sizeof(Item)];
}

}
}

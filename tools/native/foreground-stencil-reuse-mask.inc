namespace foregroundStencil {

namespace {

constexpr uint32_t TagCapacity = 2048;

struct Tag {
    NodeProxy* node = nullptr;
    uint32_t source = 0;
    uint32_t generation = 0;
};

struct MaskScope {
    Tag tags[TagCapacity];
    NodeProxy* retained[TagCapacity];
    MaskDraw draws[TagCapacity];
    uint32_t generation = 0;
    uint32_t tagCount = 0;
    uint32_t drawCount = 0;
    bool active = false;
    bool pending = false;
};

thread_local MaskScope scope;

Tag* findTag(NodeProxy* node, bool add)
{
    if (!node) return nullptr;
    auto hash = static_cast<uint32_t>(reinterpret_cast<uintptr_t>(node) >> 3);
    hash ^= hash >> 13;
    hash *= 0x85ebca6bu;
    for (uint32_t i = 0; i < TagCapacity; ++i) {
        auto& entry = scope.tags[(hash + i) & (TagCapacity - 1)];
        if (entry.generation != scope.generation) return add ? &entry : nullptr;
        if (entry.node == node) return &entry;
    }
    return nullptr;
}

uint32_t sourceFor(NodeProxy* node)
{
    if (!enabled()) return 0;
    const auto* entry = findTag(node, false);
    return entry ? entry->source : 0;
}

bool stockQuadLayout(const VertexFormat& format)
{
    const uint32_t stride = format.getBytes();
    if ((stride != 20 && stride != 24) || format.getAttributeNames().size() != 3) return false;
    static const size_t position = std::hash<std::string>{}("a_position");
    static const size_t uv = std::hash<std::string>{}("a_uv0");
    static const size_t color = std::hash<std::string>{}("a_color");
    const auto* p = format.getElement(position);
    const auto* u = format.getElement(uv);
    const auto* c = format.getElement(color);
    const uint32_t positionBytes = stride - 12;
    return p && u && c && p->offset == 0 && p->bytes == positionBytes && p->num == positionBytes / sizeof(float) &&
        p->type == AttribType::FLOAT32 && p->stride == stride && !p->normalize &&
        u->offset == positionBytes && u->bytes == 8 && u->num == 2 &&
        u->type == AttribType::FLOAT32 && u->stride == stride && !u->normalize &&
        c->offset == positionBytes + 8 && c->bytes == 4 && c->num == 4 &&
        c->type == AttribType::UINT8 && c->stride == stride && c->normalize;
}

void recordMask(NodeProxy* node, uint32_t source, Scene* scene, uint32_t start, RenderData* data, uint32_t stride)
{
    if (!enabled() || scope.pending || scope.drawCount == TagCapacity || scene->getModelCount() != start + 2 ||
        !data || !data->getVertices() || !data->getIndices() || data->getVBytes() != stride * 4 ||
        data->getVBytes() > QuadVertexCapacity || data->getIBytes() != QuadIndexBytes) return;
    const auto& models = scene->getModels();
    auto& draw = scope.draws[scope.drawCount];
    draw.node = node;
    draw.clear = models[start];
    draw.writer = models[start + 1];
    draw.paint = nullptr;
    draw.source = source;
    draw.cullingMask = static_cast<uint32_t>(node->getCullingMask());
    draw.vertexBytes = data->getVBytes();
    std::memcpy(draw.vertices, data->getVertices(), draw.vertexBytes);
    std::memcpy(draw.indices, data->getIndices(), QuadIndexBytes);
    scope.pending = true;
}

void recordPaint(NodeProxy* node, Scene* scene)
{
    if (!scope.pending) return;
    auto& draw = scope.draws[scope.drawCount];
    if (draw.node != node) return;
    scope.pending = false;
    const auto& models = scene->getModels();
    if (models.size() < 2 || models[models.size() - 2] != draw.writer) return;
    draw.paint = models.back();
    ++scope.drawCount;
}

}

bool begin()
{
    if (scope.active) return false;
    if (++scope.generation == 0) {
        for (auto& entry : scope.tags) entry.generation = 0;
        ++scope.generation;
    }
    scope.active = true;
    return true;
}

bool tag(NodeProxy* node, uint32_t source)
{
    if (!scope.active || !source) return false;
    auto* entry = findTag(node, true);
    if (!entry) return false;
    if (entry->generation == scope.generation) return entry->source == source;
    entry->node = node;
    entry->source = source;
    entry->generation = scope.generation;
    // Middleware can destroy scene nodes before traversal. Keep the proxy
    // alive so a different node cannot acquire a tagged address mid-draw.
    node->retain();
    scope.retained[scope.tagCount++] = node;
    return true;
}

bool end()
{
    if (!scope.active) return false;
    scope.active = false;
    scope.pending = false;
    scope.drawCount = 0;
    while (scope.tagCount) scope.retained[--scope.tagCount]->release();
    return true;
}

bool enabled() { return scope.active && scope.tagCount > 1; }

const MaskDraw* draws(uint32_t& count)
{
    count = enabled() ? scope.drawCount : 0;
    return scope.draws;
}

}

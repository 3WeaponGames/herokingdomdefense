#include <windows.h>
#include <algorithm>
#include <array>
#include <new>
#include <unordered_map>
#include <vector>

#if !defined(_WIN32) || !defined(_M_IX86)
#error Targetless leaf matrices are supported only in the pinned Windows x86 build.
#endif

extern "C" {
__declspec(dllexport) DWORD HKDTargetlessLeafMatrices = 1;
}

// The enrolled native world rows and their exact parent pointers are authoritative.
// Pooled arrays may be replaced by JSB. Retire the ledger at the actual writer.
namespace hkdTargetlessLeafMatrices {
using namespace cocos2d::renderer;
using Info = RenderFlow::LevelInfo;
constexpr std::size_t MaxSeeds = 32;
constexpr std::size_t MaxPoolSlots = 1024;
constexpr uint32_t Own = RenderFlow::WORLD_TRANSFORM | RenderFlow::OPACITY;
constexpr uint32_t Changed = RenderFlow::WORLD_TRANSFORM_CHANGED | RenderFlow::NODE_OPACITY_CHANGED;

struct Range {
    std::uintptr_t first = 0;
    std::uintptr_t last = 0;
    bool okay() const { return first && first < last; }
    bool overlaps(const Range& other) const { return first < other.last && other.first < last; }
};
template<class T> Range range(T* first, std::size_t count) {
    const auto base = reinterpret_cast<std::uintptr_t>(first);
    return Range{base, base + count * sizeof(T)};
}

struct Unit {
    UnitCommon* common = nullptr;
    UnitNode* native = nullptr;
    Sign* signs = nullptr;
    uint32_t* dirty = nullptr;
    std::size_t slots = 0;
    std::size_t enrolled = 0;
    std::array<Range, 8> fields{};
    std::vector<uint32_t> enrolledSlots;
    bool same(UnitCommon* c, UnitNode* n) const {
        return common == c && native == n && slots == c->getContentNum() &&
            signs == c->getSignData(0) && dirty == n->getDirty(0);
    }
};

struct Entry {
    Info info{};
    NodeProxy* owner = nullptr;
    std::size_t unit = 0;
    std::size_t slot = 0;
    std::size_t level = 0;
    std::uint64_t sequence = 0;
    std::size_t dependents = 0;
    cocos2d::Mat4* wantedWorld = nullptr;
    uint8_t* wantedOpacity = nullptr;
    bool missing() const { return dependents && !owner; }
};
struct Registry {
    RenderFlow* flow = nullptr;
    NodeMemPool* memory = nullptr;
    bool safe = true;
    std::size_t size = 0;
    std::size_t dangling = 0;
    std::size_t stockCount = 0;
    std::uint64_t sequence = 0;
    std::unordered_map<std::size_t, Unit> units;
    std::vector<const Unit*> unitIndex;
    std::unordered_map<const uint32_t*, Entry> rows;
};
thread_local Registry registry;

static bool hasWriter(RenderFlow* flow) {
    return registry.safe && registry.flow == flow;
}
void beginFlow(RenderFlow* flow) {
    if (registry.flow) {
        registry.safe = false;
        return;
    }
    registry.flow = flow;
}
void endFlow(RenderFlow* flow) {
    if (registry.flow == flow) registry = Registry{};
}
void poolOwnerDying(const MemPool* pool) {
    if (registry.memory && static_cast<const MemPool*>(registry.memory) == pool)
        registry.safe = false;
}
void beforeUnitWrite(const MemPool* pool, std::size_t id) {
    if (!registry.safe || !registry.memory || static_cast<const MemPool*>(registry.memory) != pool) return;
    const auto it = registry.units.find(id);
    if (it == registry.units.end()) return;
    if (it->second.enrolled) registry.safe = false; // Retire before a typed backing can be reused at the same address.
    else {
        registry.unitIndex[id] = nullptr;
        registry.units.erase(it);
    }
}
void proxyDying(NodeProxy* proxy, const uint32_t* dirty) {
    if (!registry.safe || !dirty) return;
    const auto it = registry.rows.find(dirty);
    if (it != registry.rows.end() && it->second.owner == proxy) registry.safe = false;
}

static Unit* remember(UnitCommon* common, UnitNode* native) {
    if (!common || !native) return nullptr;
    const auto id = common->unitID;
    const auto seen = registry.units.find(id);
    if (seen != registry.units.end()) return seen->second.same(common, native) ? &seen->second : nullptr;
    const auto slots = common->getContentNum();
    if (!slots || slots > MaxPoolSlots) return nullptr;
    Unit unit;
    unit.common = common;
    unit.native = native;
    unit.signs = common->getSignData(0);
    unit.dirty = native->getDirty(0);
    unit.slots = slots;
    unit.enrolledSlots.assign(slots, 0);
    unit.fields = {{range(unit.dirty, slots), range(native->getLocalMat(0), slots),
        range(native->getWorldMat(0), slots), range(native->getOpacity(0), slots),
        range(unit.signs, slots), range(native->getTRS(0), slots),
        range(native->getIs3D(0), slots), range(native->getNode(0), slots)}};
    for (std::size_t i = 0; i < unit.fields.size(); ++i) {
        const auto& area = unit.fields[i];
        if (!area.okay()) return nullptr;
        for (std::size_t j = 0; j < i; ++j) if (area.overlaps(unit.fields[j])) return nullptr;
        for (const auto& pool : registry.units)
            for (const auto& prior : pool.second.fields) if (area.overlaps(prior)) return nullptr;
    }
    if (id >= registry.unitIndex.size()) registry.unitIndex.resize(id + 1, nullptr);
    auto* enrolled = &registry.units.emplace(id, unit).first->second;
    registry.unitIndex[id] = enrolled;
    return enrolled;
}
static void changedMissing(bool before, const Entry& row) {
    if (before && !row.missing()) --registry.dangling;
    if (!before && row.missing()) ++registry.dangling;
}
static void leaveParent(const uint32_t* dirty) {
    if (!dirty) return;
    auto parent = registry.rows.find(dirty);
    if (parent == registry.rows.end() || !parent->second.dependents) {
        registry.safe = false;
        return;
    }
    const bool dangling = parent->second.missing();
    --parent->second.dependents;
    if (!parent->second.dependents) {
        parent->second.wantedWorld = nullptr;
        parent->second.wantedOpacity = nullptr;
    }
    changedMissing(dangling, parent->second);
    if (!parent->second.owner && !parent->second.dependents) registry.rows.erase(parent);
}
static void enterParent(const Info& child) {
    if (!child.parentDirty) return;
    auto& parent = registry.rows[child.parentDirty];
    if ((parent.dependents && (parent.wantedWorld != child.parentWorldMat ||
            parent.wantedOpacity != child.parentRealOpacity)) ||
        (parent.owner && (parent.info.worldMat != child.parentWorldMat ||
            parent.info.realOpacity != child.parentRealOpacity))) {
        registry.safe = false;
        return;
    }
    parent.wantedWorld = child.parentWorldMat;
    parent.wantedOpacity = child.parentRealOpacity;
    const bool dangling = parent.missing();
    ++parent.dependents;
    changedMissing(dangling, parent);
}
void added(RenderFlow* flow, const Info& info, std::size_t level,
        std::size_t unitId, std::size_t slot, NodeProxy* owner) {
    if (!hasWriter(flow)) return;
    auto* memory = NodeMemPool::getInstance();
    if (!memory || (registry.memory && registry.memory != memory) ||
            unitId >= memory->getNodePool().size() || unitId >= memory->getCommonPool().size()) {
        registry.safe = false;
        return;
    }
    registry.memory = memory;
    try {
        auto* unit = remember(memory->getCommonPool()[unitId], memory->getNodePool()[unitId]);
        if (!unit || slot >= unit->slots || unit->signs[slot].freeFlag != 1 ||
                reinterpret_cast<std::uintptr_t>(owner) != *unit->native->getNode(slot) ||
                info.dirty != unit->dirty + slot || info.worldMat != unit->native->getWorldMat(slot) ||
                info.localMat != unit->native->getLocalMat(slot) || info.opacity != unit->native->getOpacity(slot) ||
                !info.realOpacity || info.dirty == info.parentDirty ||
                ((!info.parentDirty) != (!info.parentWorldMat)) ||
                ((!info.parentDirty) != (!info.parentRealOpacity)) ||
                registry.sequence == UINT64_MAX) {
            registry.safe = false;
            return;
        }
        auto& entry = registry.rows[info.dirty];
        if (entry.owner || (entry.dependents &&
                (entry.wantedWorld != info.worldMat || entry.wantedOpacity != info.realOpacity))) {
            registry.safe = false;
            return;
        }
        const bool missing = entry.missing();
        entry.info = info;
        entry.owner = owner;
        entry.unit = unitId;
        entry.slot = slot;
        entry.level = level;
        entry.sequence = ++registry.sequence;
        changedMissing(missing, entry);
        ++registry.size;
        unit->enrolledSlots[slot] = Own;
        ++unit->enrolled;
        enterParent(info);
    } catch (const std::bad_alloc&) {
        registry.safe = false;
    }
}
void removed(RenderFlow* flow, const Info& info, std::size_t level) {
    if (!hasWriter(flow)) return;
    auto it = registry.rows.find(info.dirty);
    if (it == registry.rows.end() || !it->second.owner || it->second.level != level ||
            it->second.info.worldMat != info.worldMat || it->second.info.parentDirty != info.parentDirty) {
        registry.safe = false;
        return;
    }
    auto unit = registry.units.find(it->second.unit);
    if (unit == registry.units.end() || !unit->second.enrolled || !registry.size) {
        registry.safe = false;
        return;
    }
    unit->second.enrolledSlots[it->second.slot] = 0;
    --unit->second.enrolled;
    --registry.size;
    if (it->second.dependents) {
        it->second.owner = nullptr;
        ++registry.dangling;
    } else {
        registry.rows.erase(it);
    }
    leaveParent(info.parentDirty);
}

struct Selection {
    bool valid = true;
    const Unit* unit = nullptr;
    std::size_t examined = 0;
    std::size_t count = 0;
    std::array<const Entry*, MaxSeeds> rows{};
    void pool(UnitCommon* common, UnitNode* native) {
        unit = nullptr;
        if (!valid) return;
        const auto id = common->unitID;
        if (id < registry.unitIndex.size()) unit = registry.unitIndex[id];
        // A detached node can allocate a live pool before it has any world rows.
        // Its local pass still writes storage, so verify its ranges before collecting.
        if (!unit) {
            try {
                unit = remember(common, native);
            } catch (const std::bad_alloc&) {
                valid = false;
                return;
            }
        }
        if (!unit || !unit->same(common, native)) { valid = false; return; }
        examined += unit->enrolled;
    }
    void collect(uint32_t* dirty, std::size_t slot, uint32_t value, bool live) {
        if (!valid || !unit || !(value & (Own | Changed))) return;
        const auto row = registry.rows.find(dirty);
        if (row == registry.rows.end() || !row->second.owner) { valid = false; return; }
        const auto& hit = row->second;
        if (hit.unit != unit->common->unitID || hit.slot != slot || !live ||
                !unit->signs[slot].freeFlag || (value & Changed) ||
                *unit->native->getNode(slot) != reinterpret_cast<std::uintptr_t>(hit.owner)) {
            valid = false;
        } else if (hit.dependents) {
            valid = false;
        } else if (count < rows.size()) {
            rows[count++] = &hit;
        } else {
            valid = false;
        }
    }
    bool ready() {
        if (!valid) return false;
        if (!registry.safe || registry.dangling || examined != registry.size || registry.size != registry.stockCount) {
            return false;
        }
        std::sort(rows.begin(), rows.begin() + count, [](const Entry* a, const Entry* b) {
            return a->level != b->level ? a->level < b->level : a->sequence < b->sequence;
        });
        return true;
    }
};
thread_local Selection* selecting = nullptr;
struct SelectScope {
    explicit SelectScope(Selection* selection) { selecting = selection; }
    ~SelectScope() { selecting = nullptr; }
};
}

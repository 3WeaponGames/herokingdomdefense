namespace hkd_spine_inventory {
std::unordered_set<spine::SkeletonRenderer*>& live();
}

static bool js_hkdCaptureRealtimeInventory(se::State& state)
{
    const auto& args = state.args();
    if (args.size() != 0) return false;

    auto* engine = se::ScriptEngine::getInstance();
    if (!engine->isValid() || engine->isInCleanup()) {
        state.rval().setNull();
        return true;
    }

    // Retain only a local JS value for each currently mapped stock wrapper.
    // Finish reading the C++ set before attempting any JS Array writes.
    std::vector<se::Value> wrappers;
    auto& live = hkd_spine_inventory::live();
    wrappers.reserve(live.size());
    for (auto* renderer : live) {
        auto* animation = dynamic_cast<spine::SkeletonAnimation*>(renderer);
        void* key = animation ? static_cast<void*>(animation) : static_cast<void*>(renderer);
        auto it = se::NativePtrToObjectMap::find(key);
        if (it == se::NativePtrToObjectMap::end()) continue;
        auto* js = it->second;
        auto* expected = animation ? __jsb_spine_SkeletonAnimation_class : __jsb_spine_SkeletonRenderer_class;
        if (!js || !expected || js->_getClass() != expected || js->getPrivateData() != key) {
            state.rval().setNull();
            return true;
        }
        wrappers.emplace_back(js, true);
    }

    se::HandleObject out(se::Object::createArrayObject(wrappers.size()));
    for (uint32_t i = 0; i < wrappers.size(); ++i) {
        if (!out->setArrayElement(i, wrappers[i])) {
            state.rval().setNull();
            return true;
        }
    }
    state.rval().setObject(out);
    return true;
}
SE_BIND_FUNC(js_hkdCaptureRealtimeInventory)

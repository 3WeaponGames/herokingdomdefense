#include "renderer/scene/RenderFlow.hpp"
#include "cocos/scripting/js-bindings/auto/jsb_renderer_auto.hpp"
#include <cstring>

namespace {
bool callHkdTargetlessMaterialize(void* input) {
    auto* callback = static_cast<se::Object*>(input);
    se::Value result;
    return callback->call(se::EmptyValueArray, nullptr, &result) && result.isBoolean() && result.toBoolean();
}

bool js_hkdTargetlessLeaf(se::State& s) {
    const auto& a = s.args();
    s.rval().setInt32(0);
    if (a.size() != 4 || !a[3].isObject() || !a[3].toObject()->isFunction()) return true;
    const int result = hkdTargetless::dispatch(
        hkdFramebufferWrapper<hkdTargetless::RenderFlow>(a[0], __jsb_cocos2d_renderer_RenderFlow_class),
        hkdFramebufferWrapper<hkdTargetless::NodeProxy>(a[1], __jsb_cocos2d_renderer_NodeProxy_class),
        hkdFramebufferWrapper<hkdTargetless::Camera>(a[2], __jsb_cocos2d_renderer_Camera_class),
        callHkdTargetlessMaterialize, a[3].toObject());
    if (result < 0) {
        SE_REPORT_ERROR("Targetless leaf was dispatched but could not complete its original camera");
        return false;
    }
    s.rval().setInt32(result);
    return true;
}
SE_BIND_FUNC(js_hkdTargetlessLeaf)

bool js_hkdTargetlessLeafStats(se::State& s) {
    const auto& a = s.args();
    s.rval().setBoolean(false);
    if (a.size() != 2 || !a[0].isObject() || !a[1].isBoolean()) return true;
    auto* out = a[0].toObject();
    std::uint8_t* bytes = nullptr;
    std::size_t length = 0;
    double data[hkdTargetless::Count];
    if (!out->isTypedArray() || out->getTypedArrayType() != se::Object::TypedArrayType::FLOAT64 ||
        !out->getTypedArrayData(&bytes, &length) || !bytes || length != sizeof(data)) return true;
    std::uint64_t counts[hkdTargetless::Count];
    if (!hkdTargetless::stats(counts, a[1].toBoolean())) return true;
    for (std::size_t i = 0; i < hkdTargetless::Count; ++i) data[i] = static_cast<double>(counts[i]);
    std::memcpy(bytes, data, sizeof(data));
    s.rval().setBoolean(true);
    return true;
}
SE_BIND_FUNC(js_hkdTargetlessLeafStats)
}

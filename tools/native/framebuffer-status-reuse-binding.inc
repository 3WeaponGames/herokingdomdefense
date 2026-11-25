#include "cocos/scripting/js-bindings/auto/jsb_gfx_auto.hpp"
#include "renderer/gfx/FrameBuffer.h"
#include "renderer/gfx/Texture2D.h"
#include "renderer/gfx/RenderBuffer.h"

namespace hkdFramebufferStatus {
bool arm(const cocos2d::renderer::FrameBuffer*, const cocos2d::renderer::Texture2D*, const cocos2d::renderer::RenderBuffer*);
void disarm();
}

namespace {
template<class Native>
Native* hkdFramebufferWrapper(const se::Value& value, se::Class* type)
{
    return value.isObject() && type && value.toObject()->_getClass() == type
        ? static_cast<Native*>(value.toObject()->getPrivateData()) : nullptr;
}

bool js_hkdArmCaptureFramebufferStatus(se::State& s)
{
    const auto& args = s.args();
    if (args.empty()) {
        hkdFramebufferStatus::disarm();
        s.rval().setBoolean(true);
        return true;
    }
    if (args.size() != 3) {
        hkdFramebufferStatus::disarm();
        s.rval().setBoolean(false);
        return true;
    }
    using namespace cocos2d::renderer;
    auto* target = hkdFramebufferWrapper<FrameBuffer>(args[0], __jsb_cocos2d_renderer_FrameBuffer_class);
    auto* color = hkdFramebufferWrapper<Texture2D>(args[1], __jsb_cocos2d_renderer_Texture2D_class);
    auto* stencil = hkdFramebufferWrapper<RenderBuffer>(args[2], __jsb_cocos2d_renderer_RenderBuffer_class);
    s.rval().setBoolean(hkdFramebufferStatus::arm(target, color, stencil));
    return true;
}
SE_BIND_FUNC(js_hkdArmCaptureFramebufferStatus)
}


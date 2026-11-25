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

#if CC_TARGET_PLATFORM == CC_PLATFORM_WIN32
#include <cstddef>
#include <cstdint>
#include <cstring>

namespace hkdFramebufferStatus { std::uint64_t sceneryAlphaEpoch(); }

namespace {
class HkdRestoreReadFramebuffer {
public:
    HkdRestoreReadFramebuffer() { glGetIntegerv(GL_READ_FRAMEBUFFER_BINDING, &saved); }
    ~HkdRestoreReadFramebuffer() { glBindFramebuffer(GL_READ_FRAMEBUFFER, static_cast<GLuint>(saved)); }
    HkdRestoreReadFramebuffer(const HkdRestoreReadFramebuffer&) = delete;
    HkdRestoreReadFramebuffer& operator=(const HkdRestoreReadFramebuffer&) = delete;
private:
    GLint saved = 0;
};

bool hkdSceneryReadPackSafe(int width)
{
    GLint buffer = 0, alignment = 0, row = 0, skipRows = 0, skipPixels = 0;
    glGetIntegerv(GL_PIXEL_PACK_BUFFER_BINDING, &buffer);
    glGetIntegerv(GL_PACK_ALIGNMENT, &alignment);
    glGetIntegerv(GL_PACK_ROW_LENGTH, &row);
    glGetIntegerv(GL_PACK_SKIP_ROWS, &skipRows);
    glGetIntegerv(GL_PACK_SKIP_PIXELS, &skipPixels);
    return buffer == 0 && row == 0 && skipRows == 0 && skipPixels == 0 &&
        (alignment == 1 || alignment == 2 || alignment == 4 || (alignment == 8 && width % 2 == 0));
}

GLint hkdReadAttachment(GLenum target, GLenum pname)
{
    GLint value = -1;
    glGetFramebufferAttachmentParameteriv(GL_READ_FRAMEBUFFER, target, pname, &value);
    return value;
}

bool hkdSceneryReadColor(const cocos2d::renderer::FrameBuffer* framebuffer, const cocos2d::renderer::Texture2D* color,
    unsigned char* data, std::size_t bytes)
{
    if (!framebuffer || !color || !data || !GLEW_VERSION_3_0 || !glBindFramebuffer ||
        !glCheckFramebufferStatus || !glGetFramebufferAttachmentParameteriv || !glIsFramebuffer) return false;
    const int width = framebuffer->getWidth(), height = framebuffer->getHeight();
    const auto fbo = framebuffer->getHandle(), name = color->getHandle();
    if (!fbo || !name || width < 2 || height < 2 || width > 512 || height > 512 ||
        bytes != std::size_t(width) * std::size_t(height) * 4 ||
        color->getWidth() != width || color->getHeight() != height || color->getTarget() != GL_TEXTURE_2D ||
        framebuffer->getColorBuffers().size() != 1 || framebuffer->getColorBuffers().front() != color ||
        framebuffer->getDepthBuffer() || framebuffer->getStencilBuffer() || framebuffer->getDepthStencilBuffer() ||
        !glIsFramebuffer(fbo) || !hkdSceneryReadPackSafe(width)) return false;

    const HkdRestoreReadFramebuffer restore;
    // Leave the renderer's real DRAW binding and its software mirrors alone.
    glBindFramebuffer(GL_READ_FRAMEBUFFER, fbo);
    GLint readSelection = -1;
    glGetIntegerv(GL_READ_BUFFER, &readSelection);
    if (readSelection != GL_COLOR_ATTACHMENT0 ||
        glCheckFramebufferStatus(GL_READ_FRAMEBUFFER) != GL_FRAMEBUFFER_COMPLETE ||
        hkdReadAttachment(GL_COLOR_ATTACHMENT0, GL_FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE) != GL_TEXTURE ||
        static_cast<GLuint>(hkdReadAttachment(GL_COLOR_ATTACHMENT0, GL_FRAMEBUFFER_ATTACHMENT_OBJECT_NAME)) != name ||
        hkdReadAttachment(GL_COLOR_ATTACHMENT0, GL_FRAMEBUFFER_ATTACHMENT_TEXTURE_LEVEL) != 0 ||
        hkdReadAttachment(GL_COLOR_ATTACHMENT0, GL_FRAMEBUFFER_ATTACHMENT_COMPONENT_TYPE) != GL_UNSIGNED_NORMALIZED ||
        hkdReadAttachment(GL_COLOR_ATTACHMENT0, GL_FRAMEBUFFER_ATTACHMENT_COLOR_ENCODING) != GL_LINEAR ||
        hkdReadAttachment(GL_COLOR_ATTACHMENT0, GL_FRAMEBUFFER_ATTACHMENT_RED_SIZE) != 8 ||
        hkdReadAttachment(GL_COLOR_ATTACHMENT0, GL_FRAMEBUFFER_ATTACHMENT_GREEN_SIZE) != 8 ||
        hkdReadAttachment(GL_COLOR_ATTACHMENT0, GL_FRAMEBUFFER_ATTACHMENT_BLUE_SIZE) != 8 ||
        hkdReadAttachment(GL_COLOR_ATTACHMENT0, GL_FRAMEBUFFER_ATTACHMENT_ALPHA_SIZE) != 8 ||
        hkdReadAttachment(GL_DEPTH_ATTACHMENT, GL_FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE) != GL_NONE ||
        hkdReadAttachment(GL_STENCIL_ATTACHMENT, GL_FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE) != GL_NONE) return false;

    // Byte components are unaffected by swap-byte and bitmap bit-order state.
    // Initialize the exact buffer to opaque. A failed read remains an
    // ineligible all-opaque result without consuming someone else's GL errors.
    std::memset(data, 255, bytes);
    glReadPixels(0, 0, width, height, GL_RGBA, GL_UNSIGNED_BYTE, data);
    return true;
}

bool js_hkdReadSceneryAlpha(se::State& state)
{
    const auto& args = state.args();
    state.rval().setDouble(0);
    const auto epoch = hkdFramebufferStatus::sceneryAlphaEpoch();
    if (!epoch) return true;
    if (args.empty()) { state.rval().setDouble(static_cast<double>(epoch)); return true; }
    if (args.size() != 3 || !args[2].isObject()) return true;
    using namespace cocos2d::renderer;
    const auto* target = captureTargetWrapper<FrameBuffer>(args[0], __jsb_cocos2d_renderer_FrameBuffer_class);
    const auto* color = captureTargetWrapper<Texture2D>(args[1], __jsb_cocos2d_renderer_Texture2D_class);
    auto* output = args[2].toObject();
    std::uint8_t* data = nullptr;
    std::size_t bytes = 0;
    if (!output || !output->isTypedArray() || output->getTypedArrayType() != se::Object::TypedArrayType::UINT8 ||
        !output->getTypedArrayData(&data, &bytes) || !hkdSceneryReadColor(target, color, data, bytes) ||
        hkdFramebufferStatus::sceneryAlphaEpoch() != epoch) return true;
    state.rval().setDouble(static_cast<double>(epoch));
    return true;
}
} // namespace
SE_BIND_FUNC(js_hkdReadSceneryAlpha)
#endif

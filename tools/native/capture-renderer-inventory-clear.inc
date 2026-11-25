#include "cocos/scripting/js-bindings/auto/jsb_gfx_auto.hpp"
#include "renderer/gfx/FrameBuffer.h"
#include "renderer/gfx/Texture2D.h"
#include "renderer/gfx/RenderBuffer.h"

#if CC_TARGET_PLATFORM == CC_PLATFORM_WIN32
namespace {
template<class Native>
Native* captureTargetWrapper(const se::Value& value, se::Class* type)
{
    if (!value.isObject() || !type) return nullptr;
    auto* object = value.toObject();
    return object->_getClass() == type ? static_cast<Native*>(object->getPrivateData()) : nullptr;
}

class DrawFramebufferRestore {
public:
    DrawFramebufferRestore() { glGetIntegerv(GL_DRAW_FRAMEBUFFER_BINDING, &previous); }
    ~DrawFramebufferRestore() { glBindFramebuffer(GL_DRAW_FRAMEBUFFER, static_cast<GLuint>(previous)); }
private:
    GLint previous = 0;
};

bool matchesAttachment(GLenum point, GLenum type, GLuint name)
{
    GLint actualType = 0, actualName = 0;
    glGetFramebufferAttachmentParameteriv(GL_DRAW_FRAMEBUFFER, point,
        GL_FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE, &actualType);
    if (static_cast<GLenum>(actualType) != type) return false;
    glGetFramebufferAttachmentParameteriv(GL_DRAW_FRAMEBUFFER, point,
        GL_FRAMEBUFFER_ATTACHMENT_OBJECT_NAME, &actualName);
    return static_cast<GLuint>(actualName) == name;
}

bool resetStandaloneTarget(const se::ValueArray& args)
{
    if (args.size() != 3 || !GLEW_VERSION_3_0 || !glBindFramebuffer ||
        !glCheckFramebufferStatus || !glGetFramebufferAttachmentParameteriv ||
        !glClearBufferfv || !glClearBufferiv || !glColorMaski || !glGetBooleani_v ||
        !glStencilMaskSeparate || glIsEnabled(GL_SCISSOR_TEST))
        return false;

    using namespace cocos2d::renderer;
    const auto* target = captureTargetWrapper<FrameBuffer>(args[0], __jsb_cocos2d_renderer_FrameBuffer_class);
    const auto* color = captureTargetWrapper<Texture2D>(args[1], __jsb_cocos2d_renderer_Texture2D_class);
    const auto* stencil = captureTargetWrapper<RenderBuffer>(args[2], __jsb_cocos2d_renderer_RenderBuffer_class);
    if (!target || !color || !stencil || !target->getHandle() || !color->getHandle() || !stencil->getHandle() ||
        color->getTarget() != GL_TEXTURE_2D || target->getWidth() != color->getWidth() ||
        target->getHeight() != color->getHeight() || target->getDepthBuffer() || target->getDepthStencilBuffer() ||
        target->getStencilBuffer() != stencil || target->getColorBuffers().size() != 1 ||
        target->getColorBuffers().front() != color || !glIsFramebuffer(target->getHandle()))
        return false;

    const DrawFramebufferRestore restore;
    glBindFramebuffer(GL_DRAW_FRAMEBUFFER, target->getHandle());
    if (glCheckFramebufferStatus(GL_DRAW_FRAMEBUFFER) != GL_FRAMEBUFFER_COMPLETE ||
        !matchesAttachment(GL_COLOR_ATTACHMENT0, GL_TEXTURE, color->getHandle()) ||
        !matchesAttachment(GL_STENCIL_ATTACHMENT, GL_RENDERBUFFER, stencil->getHandle()))
        return false;

    GLint drawBuffer = 0, textureLevel = -1, componentType = 0, stencilSize = 0;
    glGetIntegerv(GL_DRAW_BUFFER0, &drawBuffer);
    glGetFramebufferAttachmentParameteriv(GL_DRAW_FRAMEBUFFER, GL_COLOR_ATTACHMENT0,
        GL_FRAMEBUFFER_ATTACHMENT_TEXTURE_LEVEL, &textureLevel);
    glGetFramebufferAttachmentParameteriv(GL_DRAW_FRAMEBUFFER, GL_COLOR_ATTACHMENT0,
        GL_FRAMEBUFFER_ATTACHMENT_COMPONENT_TYPE, &componentType);
    glGetFramebufferAttachmentParameteriv(GL_DRAW_FRAMEBUFFER, GL_STENCIL_ATTACHMENT,
        GL_FRAMEBUFFER_ATTACHMENT_STENCIL_SIZE, &stencilSize);
    if (drawBuffer != GL_COLOR_ATTACHMENT0 || textureLevel != 0 ||
        componentType != GL_UNSIGNED_NORMALIZED || stencilSize != 8)
        return false;

    GLboolean writes[4]{};
    GLint front = 0, back = 0;
    glGetBooleani_v(GL_COLOR_WRITEMASK, 0, writes);
    glGetIntegerv(GL_STENCIL_WRITEMASK, &front);
    glGetIntegerv(GL_STENCIL_BACK_WRITEMASK, &back);
    const bool changeColor = !writes[0] || !writes[1] || !writes[2] || !writes[3];
    const bool changeFront = (front & 255) != 255;
    const bool changeBack = (back & 255) != 255;
    if (changeColor) glColorMaski(0, GL_TRUE, GL_TRUE, GL_TRUE, GL_TRUE);
    if (changeFront) glStencilMaskSeparate(GL_FRONT, 255);
    if (changeBack) glStencilMaskSeparate(GL_BACK, 255);
    const GLfloat transparent[4]{};
    const GLint zero = 0;
    glClearBufferfv(GL_COLOR, 0, transparent);
    glClearBufferiv(GL_STENCIL, 0, &zero);
    if (changeColor) glColorMaski(0, writes[0], writes[1], writes[2], writes[3]);
    if (changeFront) glStencilMaskSeparate(GL_FRONT, static_cast<GLuint>(front));
    if (changeBack) glStencilMaskSeparate(GL_BACK, static_cast<GLuint>(back));
    return true;
}
} // namespace

static bool js_hkdResetStandaloneTarget(se::State& state)
{
    state.rval().setBoolean(resetStandaloneTarget(state.args()));
    return true;
}
SE_BIND_FUNC(js_hkdResetStandaloneTarget)
#endif

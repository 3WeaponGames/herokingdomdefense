#include "gfx/RenderBuffer.h"
#include <array>
#include <atomic>
#include <cstdint>
#include <typeinfo>
#include <windows.h>

namespace hkdFramebufferStatus {
using cocos2d::renderer::FrameBuffer;
using cocos2d::renderer::Texture2D;
using cocos2d::renderer::RenderBuffer;
struct Ticket {
    const FrameBuffer* target = nullptr;
    const Texture2D* color = nullptr;
    const RenderBuffer* stencil = nullptr;
    std::uint32_t targetName = 0, colorName = 0, stencilName = 0;
    HGLRC context = nullptr;
    std::uint64_t generation = 0;
    std::uint64_t mutation = 0;
    int width = 0, height = 0;
};

namespace {
std::atomic<HGLRC> activeContext{nullptr};
std::atomic<DWORD> activeThread{0};
std::atomic<std::uint64_t> generation{1};
std::atomic<std::uint64_t> mutation{1};
thread_local Ticket armed;
thread_local std::array<Ticket, 256> certified{};

Ticket& slot(std::uint32_t name) { return certified[name % certified.size()]; }

bool matches(const Ticket& a, const Ticket& b)
{
    return a.target && a.target == b.target && a.color == b.color && a.stencil == b.stencil &&
        a.targetName == b.targetName && a.colorName == b.colorName && a.stencilName == b.stencilName &&
        a.context == b.context && a.generation == b.generation && a.mutation == b.mutation &&
        a.width == b.width && a.height == b.height;
}

bool signature(const FrameBuffer* target, const Texture2D* color, const RenderBuffer* stencil, Ticket& out)
{
    const auto life = generation.load(std::memory_order_acquire);
    const auto raw = mutation.load(std::memory_order_acquire);
    const auto context = activeContext.load(std::memory_order_acquire);
    if (!context || activeThread.load(std::memory_order_acquire) != GetCurrentThreadId() ||
        wglGetCurrentContext() != context || !target || !color || !stencil ||
        typeid(*color) != typeid(Texture2D) || typeid(*stencil) != typeid(RenderBuffer) ||
        target->getDepthBuffer() || target->getDepthStencilBuffer() ||
        target->getStencilBuffer() != stencil || target->getColorBuffers().size() != 1 ||
        target->getColorBuffers().front() != color || color->getTarget() != GL_TEXTURE_2D ||
        target->getWidth() != color->getWidth() || target->getHeight() != color->getHeight() ||
        target->getWidth() < 2 || target->getHeight() < 2 || target->getWidth() > 512 || target->getHeight() > 512 ||
        !target->getHandle() || !color->getHandle() || !stencil->getHandle() ||
        life != generation.load(std::memory_order_acquire) || raw != mutation.load(std::memory_order_acquire)) return false;
    out.target = target; out.color = color; out.stencil = stencil;
    out.targetName = target->getHandle(); out.colorName = color->getHandle(); out.stencilName = stencil->getHandle();
    out.context = context; out.generation = life; out.mutation = raw;
    out.width = target->getWidth(); out.height = target->getHeight();
    return true;
}

bool attachment(GLenum point, GLenum type, std::uint32_t name)
{
    GLint actualType = 0, actualName = 0;
    glGetFramebufferAttachmentParameteriv(GL_FRAMEBUFFER, point, GL_FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE, &actualType);
    if (actualType != static_cast<GLint>(type)) return false;
    if (type == GL_NONE) return name == 0;
    glGetFramebufferAttachmentParameteriv(GL_FRAMEBUFFER, point, GL_FRAMEBUFFER_ATTACHMENT_OBJECT_NAME, &actualName);
    return static_cast<std::uint32_t>(actualName) == name;
}

bool matchesInstalledTarget(const Ticket& ticket)
{
    if (!GLEW_VERSION_3_0 || !glGetFramebufferAttachmentParameteriv) return false;
    GLint draw = 0, read = 0, drawBuffer = 0, readBuffer = 0, level = -1, stencilSize = 0;
    glGetIntegerv(GL_DRAW_FRAMEBUFFER_BINDING, &draw);
    glGetIntegerv(GL_READ_FRAMEBUFFER_BINDING, &read);
    glGetIntegerv(GL_DRAW_BUFFER0, &drawBuffer);
    glGetIntegerv(GL_READ_BUFFER, &readBuffer);
    if (static_cast<std::uint32_t>(draw) != ticket.targetName || draw != read || drawBuffer != GL_COLOR_ATTACHMENT0 ||
        readBuffer != GL_COLOR_ATTACHMENT0 || !attachment(GL_COLOR_ATTACHMENT0, GL_TEXTURE, ticket.colorName) ||
        !attachment(GL_STENCIL_ATTACHMENT, GL_RENDERBUFFER, ticket.stencilName) ||
        !attachment(GL_DEPTH_ATTACHMENT, GL_NONE, 0)) return false;
    glGetFramebufferAttachmentParameteriv(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_FRAMEBUFFER_ATTACHMENT_TEXTURE_LEVEL, &level);
    glGetFramebufferAttachmentParameteriv(GL_FRAMEBUFFER, GL_STENCIL_ATTACHMENT, GL_FRAMEBUFFER_ATTACHMENT_STENCIL_SIZE, &stencilSize);
    return level == 0 && stencilSize == 8;
}
}

void disarm() { armed = Ticket{}; }

void resetDevice()
{
    generation.fetch_add(1, std::memory_order_acq_rel);
    disarm();
    certified.fill(Ticket{});
}

void closeContext()
{
    activeContext.store(nullptr, std::memory_order_release);
    activeThread.store(0, std::memory_order_release);
    resetDevice();
}

void openContext()
{
    closeContext();
    const auto current = wglGetCurrentContext();
    if (!current) return;
    activeThread.store(GetCurrentThreadId(), std::memory_order_release);
    activeContext.store(current, std::memory_order_release);
}

void rawMutation()
{
    mutation.fetch_add(1, std::memory_order_acq_rel);
}

// The framebuffer status feature already revokes these generations at
// DeviceGraphics teardown and at both ends of the Win32 GLView lifetime.
std::uint64_t sceneryAlphaEpoch()
{
    const auto life = generation.load(std::memory_order_acquire);
    const auto raw = mutation.load(std::memory_order_acquire);
    const auto context = activeContext.load(std::memory_order_acquire);
    constexpr std::uint64_t limit = 1ULL << 26;
    if (!context || activeThread.load(std::memory_order_acquire) != GetCurrentThreadId() ||
        wglGetCurrentContext() != context || life >= limit || raw >= limit ||
        life != generation.load(std::memory_order_acquire) || raw != mutation.load(std::memory_order_acquire))
        return 0;
    return life * limit + raw;
}

bool arm(const FrameBuffer* target, const Texture2D* color, const RenderBuffer* stencil)
{
    if (!armed.target && signature(target, color, stencil, armed)) return true;
    disarm();
    return false;
}

void invalidate(const FrameBuffer* target)
{
    if (!target || !target->getHandle() || !activeContext.load(std::memory_order_acquire)) return;
    if (activeThread.load(std::memory_order_acquire) != GetCurrentThreadId()) { rawMutation(); return; }
    auto& old = slot(target->getHandle());
    if (old.target == target) old = Ticket{};
    if (armed.target == target) disarm();
}

void storageMutation(bool stencil, std::uint32_t name)
{
    if (!name || !activeContext.load(std::memory_order_acquire)) return;
    if (activeThread.load(std::memory_order_acquire) != GetCurrentThreadId()) { rawMutation(); return; }
    for (auto& remembered : certified) {
        if (remembered.target && (stencil ? remembered.stencilName : remembered.colorName) == name) remembered = Ticket{};
    }
    if (armed.target && (stencil ? armed.stencilName : armed.colorName) == name) disarm();
}

Ticket consume(const FrameBuffer* target)
{
    if (!armed.target) return {};
    const Ticket expected = armed;
    disarm();
    Ticket current;
    if (expected.target != target || !signature(target, expected.color, expected.stencil, current) ||
        !matches(expected, current)) return {};
    return current;
}

bool reuse(const Ticket& current)
{
    return current.target && current.generation == generation.load(std::memory_order_acquire) &&
        current.mutation == mutation.load(std::memory_order_acquire) && matches(slot(current.targetName), current);
}

void remember(const Ticket& current)
{
    if (current.target && matchesInstalledTarget(current)) slot(current.targetName) = current;
}
}


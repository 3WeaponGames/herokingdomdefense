#include "renderer/gfx/FrameBuffer.h"
#include "renderer/gfx/Texture2D.h"
#include "renderer/gfx/RenderBuffer.h"
#include "renderer/renderer/Light.h"
#include "renderer/renderer/Model.h"
#include "renderer/renderer/Scene.h"
#include "renderer/scene/assembler/CustomAssembler.hpp"
#include "editor-support/spine-creator-support/SkeletonAnimation.h"
#include "editor-support/spine-creator-support/SkeletonCacheAnimation.h"
#include <cmath>
#include <typeinfo>

namespace hkdFramebufferStatus { std::uint64_t sceneryAlphaEpoch(); }

namespace hkdTargetless {
namespace {
using namespace cocos2d;
using namespace cocos2d::renderer;

struct State {
    Ticket* pending = nullptr;
    Flow* active = nullptr;
    RenderFlow* mainFlow = nullptr;
    NodeProxy* mainRoot = nullptr;
    Scene* mainScene = nullptr;
    Camera* stockCamera = nullptr;
    unsigned depth = 0;
    std::uint64_t topology = 0;
    std::uint64_t registry = 0;
    const void* checkedManager = nullptr;
    std::uint64_t checkedGeneration = 0;
    std::size_t checkedSize = 0;
    bool knownRegistry = false;
    std::uint64_t counters[Count]{};
};
thread_local State state{};

bool underMain(NodeProxy* node) {
    if (!state.mainRoot || node == state.mainRoot) return false;
    for (unsigned depth = 0; node && depth < 128; ++depth, node = node->getParent()) {
        if (!node->isValid()) return false;
        if (node == state.mainRoot) return true;
    }
    return false;
}

bool leafShape(NodeProxy* node, AssemblerBase* assembler, bool preparing) {
    if (!node || !node->isValid() || node->getChildrenCount() || !node->getDirty() ||
        !assembler || node->getAssembler() != assembler || typeid(*assembler) != typeid(CustomAssembler)) return false;
    // The exact stock CustomAssembler postHandle is empty. Keep the stock
    // NodeProxy post call regardless of the leaf's POST_RENDER flag.
    using Traverse = void (*)(NodeProxy*, ModelBatcher*, Scene*);
    const auto* handler = node->traverseHandle.target<Traverse>();
    return handler && (*handler == NodeProxy::render || (preparing && *handler == NodeProxy::visit));
}

bool captureCamera(Camera* camera, NodeProxy* root) {
    if (!camera || !camera->getNode() || !camera->getNode()->isValid() ||
        camera->getNode()->getChildrenCount() || camera->getType() != ProjectionType::ORTHOGRAPHIC ||
        !std::isfinite(camera->getOrthoHeight()) || camera->getOrthoHeight() <= 0 ||
        (camera->getCullingMask() & root->getCullingMask()) == 0 ||
        camera->getClearFlags() != (ClearFlag::COLOR | ClearFlag::DEPTH | ClearFlag::STENCIL)) return false;
    const auto& stages = camera->getStages();
    if (stages.size() != 1 || stages[0] != "opaque") return false;
    cocos2d::renderer::Rect rect;
    camera->getRect(rect);
    Color4F color;
    camera->getColor(color);
    return rect.x == 0 && rect.y == 0 && rect.w == 1 && rect.h == 1 &&
        color.r == 0 && color.g == 0 && color.b == 0 && color.a == 0;
}

bool originalTarget(Camera* camera) {
    const auto* framebuffer = camera->getFrameBuffer();
    if (!framebuffer || !framebuffer->getHandle() || !framebuffer->getStencilBuffer() ||
        !framebuffer->getStencilBuffer()->getHandle() || framebuffer->getDepthBuffer() ||
        framebuffer->getDepthStencilBuffer() || framebuffer->getColorBuffers().size() != 1 ||
        framebuffer->getWidth() < 2 || framebuffer->getWidth() > 512 ||
        framebuffer->getHeight() < 2 || framebuffer->getHeight() > 512) return false;
    const auto* color = dynamic_cast<const Texture2D*>(framebuffer->getColorBuffers().front());
    return color && color->getHandle() && color->getTarget() == GL_TEXTURE_2D &&
        color->getWidth() == framebuffer->getWidth() && color->getHeight() == framebuffer->getHeight();
}

void requireOriginal(Flow* flow) {
    if (!flow || flow->physical || flow->failed || flow->leaf) return;
    if (flow->materializing) { flow->failed = true; return; }
    flow->materializing = true;
    ++state.counters[MaterializeCalls];
    Ticket& ticket = *flow->ticket;
    // The materializer is synchronous and owned by this still-live JSB call.
    const bool ready = ticket.materialize(ticket.context);
    flow->materializing = false;
    flow->physical = ready && !flow->failed && ticket.root->isValid() && flow->cameraNode->isValid() &&
        ticket.camera->getNode() == flow->cameraNode && originalTarget(ticket.camera);
    if (!flow->physical) {
        flow->failed = true;
        ++state.counters[MaterializeFailed];
    }
}
}

int dispatch(RenderFlow* flow, NodeProxy* root, Camera* camera, Materialize materialize, void* context) {
    ++state.counters[Requests];
    if (state.depth || state.pending || !flow || !root || !camera || !materialize ||
        state.mainFlow != flow || !state.mainScene || state.stockCamera != camera ||
        !underMain(root) || !leafShape(root, root->getAssembler(), true) || !captureCamera(camera, root) ||
        camera->getNode() == root || !hkdFramebufferStatus::sceneryAlphaEpoch()) {
        ++state.counters[Refused];
        return 0;
    }
    Ticket ticket{flow, root, camera, materialize, context};
    // Public wrappers are held by the binding's arguments and camera object.
    // Cocos explicitly destroys NodeProxy storage before Ref deletion, so
    // validity is still checked before using it after an observer.
    root->retain();
    camera->retain();
    auto* cameraNode = camera->getNode();
    cameraNode->retain();
    state.pending = &ticket;
    flow->render(root, 0.0f, camera);
    state.pending = nullptr;
    cameraNode->release();
    camera->release();
    root->release();
    return ticket.result;
}

bool stats(std::uint64_t (&out)[Count], bool reset) {
    if (state.pending || state.depth) return false;
    for (std::size_t i = 0; i < Count; ++i) {
        out[i] = state.counters[i];
        if (reset) state.counters[i] = 0;
    }
    return true;
}

Flow::Flow(RenderFlow* flow, NodeProxy* root, Scene* candidate, Camera* camera, float dt) {
    if (++state.depth != 1) { beforeObserver(); return; }
    if (!camera) {
        state.mainFlow = flow;
        state.mainRoot = root;
        state.mainScene = candidate;
        state.stockCamera = nullptr;
        return;
    }
    Ticket* request = state.pending;
    state.pending = nullptr;
    if (!request) return;
    ticket = request;
    scene = candidate;
    assembler = root->getAssembler();
    cameraNode = camera->getNode();
    epoch = hkdFramebufferStatus::sceneryAlphaEpoch();
    topology = state.topology;
    registry = state.registry;
    state.active = this;
    ++state.counters[Entered];
    if (request->flow != flow || request->root != root || request->camera != camera ||
        scene != state.mainScene || dt != 0.0f || !epoch || scene->getLightCount() != 0) {
        ++state.counters[UnexpectedShape];
        requireOriginal(this);
    }
}

Flow::~Flow() {
    if (state.active == this) state.active = nullptr;
    --state.depth;
}

void Flow::beforeLeaf() {
    if (!ticket || failed || physical) return;
    const bool shape = state.depth == 1 && state.active == this && scene == state.mainScene &&
        topology == state.topology && registry == state.registry && epoch == hkdFramebufferStatus::sceneryAlphaEpoch() &&
        owner && !conflict && underMain(ticket->root) && leafShape(ticket->root, assembler, false) &&
        ticket->camera->getNode() == cameraNode && captureCamera(ticket->camera, ticket->root) &&
        scene->getLightCount() == 0 && scene->getModels().empty();
    if (!shape) {
        ++state.counters[UnexpectedShape];
        ++state.counters[LateFallback];
        requireOriginal(this);
        return;
    }
    leaf = true;
}

bool Flow::canTraverse() {
    if (!ticket) return true;
    if (!ticket->root->isValid()) {
        failed = true;
    }
    return !failed;
}

bool Flow::useOriginalForward() {
    if (!ticket) return true;
    if (!leaf && !physical && !failed) requireOriginal(this);
    return !failed;
}

void Flow::originalDone() {
    if (state.depth != 1) return;
    if (!ticket) return;
    if (ticket->result == 2 || failed) return;
    ticket->result = 1;
    ++state.counters[OriginalForward];
}

void beforeObserver() {
    auto* flow = state.active;
    if (!flow || flow->physical || flow->failed) return;
    ++state.counters[Observer];
    requireOriginal(flow);
}

void noteRegistryWrite() {
    beforeObserver();
    ++state.registry;
}

void noteTopologyWrite() {
    beforeObserver();
    ++state.topology;
}

void noteFlowDestroyed(RenderFlow* flow) {
    if (state.mainFlow != flow) return;
    state.mainFlow = nullptr;
    state.mainRoot = nullptr;
    state.mainScene = nullptr;
    state.stockCamera = nullptr;
}

void noteNodeDestroyed(NodeProxy* node) {
    noteTopologyWrite();
    if (state.mainRoot == node) state.mainRoot = nullptr;
}

void beforeManagerUpdate(const void* manager, const std::vector<IMiddleware*>& rows, bool clean) {
    auto* flow = state.active;
    if (!flow || state.depth != 1) return;
    ++state.counters[Updates];
    if (flow->physical || flow->failed) return;
    if (!clean || rows.empty() || rows.size() > 384) {
        ++state.counters[RegistryFallback];
        requireOriginal(flow);
        return;
    }
    if (state.checkedManager != manager || state.checkedGeneration != state.registry || state.checkedSize != rows.size()) {
        ++state.counters[RegistryScans];
        state.checkedManager = manager;
        state.checkedGeneration = state.registry;
        state.checkedSize = rows.size();
        state.knownRegistry = true;
        for (auto* row : rows) {
            if (!row) { state.knownRegistry = false; break; }
            const auto& kind = typeid(*row);
            if (kind != typeid(spine::SkeletonAnimation) && kind != typeid(spine::SkeletonRenderer) &&
                kind != typeid(spine::SkeletonCacheAnimation)) { state.knownRegistry = false; break; }
        }
    }
    if (!state.knownRegistry) {
        ++state.counters[RegistryFallback];
        requireOriginal(flow);
    }
}

void noteManagerRender() {
    if (state.active && state.depth == 1) ++state.counters[MiddlewareRenders];
}

void noteRenderer(const void* renderer, NodeProxy* node, bool realtime) {
    auto* flow = state.active;
    if (!flow || state.depth != 1 || flow->physical || flow->failed || flow->ticket->root != node) return;
    if (!realtime || (flow->owner && flow->owner != renderer)) flow->conflict = true;
    else flow->owner = renderer;
}

bool omitModel(NodeProxy* node) {
    auto* flow = state.active;
    if (!flow || state.depth != 1 || !flow->leaf || flow->ticket->root != node) return false;
    ++state.counters[LeafPrefix];
    return true;
}

bool omitView(Camera* camera, Scene* scene) {
    auto* flow = state.active;
    if (!flow) {
        if (state.depth == 1 && scene == state.mainScene && camera && camera->getFrameBuffer()) state.stockCamera = camera;
        return false;
    }
    if (state.depth != 1 || !flow->leaf || flow->ticket->camera != camera || flow->scene != scene) return false;
    flow->ticket->result = 2;
    ++state.counters[NoView];
    return true;
}
}

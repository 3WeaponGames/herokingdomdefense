#include <cstddef>
#include <cstdint>
#include <vector>

namespace cocos2d {
namespace middleware { class IMiddleware; }
namespace renderer { class RenderFlow; class NodeProxy; class Camera; class Scene; class AssemblerBase; }
}

namespace hkdTargetless {
using cocos2d::renderer::RenderFlow;
using cocos2d::renderer::NodeProxy;
using cocos2d::renderer::Camera;
using cocos2d::renderer::Scene;
using cocos2d::renderer::AssemblerBase;
using cocos2d::middleware::IMiddleware;
using Materialize = bool (*)(void*);

enum Metric : std::size_t {
    Requests, Refused, Entered, Updates, MiddlewareRenders, Observer, RegistryFallback,
    LateFallback, MaterializeCalls, MaterializeFailed, LeafPrefix, NoView, OriginalForward,
    UnexpectedShape, RegistryScans, Count
};

struct Ticket {
    RenderFlow* flow;
    NodeProxy* root;
    Camera* camera;
    Materialize materialize;
    void* context;
    int result = -1; // A dispatched error can never restart the stock camera.
};

struct Flow {
    Flow(RenderFlow*, NodeProxy*, Scene*, Camera*, float);
    ~Flow();
    bool beforeUpdate() const { return !failed; }
    void beforeLeaf();
    bool canTraverse();
    bool useOriginalForward();
    void originalDone();

    Ticket* ticket = nullptr;
    Scene* scene = nullptr;
    AssemblerBase* assembler = nullptr;
    NodeProxy* cameraNode = nullptr;
    const void* owner = nullptr;
    std::uint64_t epoch = 0;
    std::uint64_t topology = 0;
    std::uint64_t registry = 0;
    bool conflict = false;
    bool physical = false;
    bool leaf = false;
    bool failed = false;
    bool materializing = false;
};

int dispatch(RenderFlow*, NodeProxy*, Camera*, Materialize, void*);
bool stats(std::uint64_t (&out)[Count], bool reset);
void beforeObserver();
void noteRegistryWrite();
void noteTopologyWrite();
void noteFlowDestroyed(RenderFlow*);
void noteNodeDestroyed(NodeProxy*);
void beforeManagerUpdate(const void*, const std::vector<IMiddleware*>&, bool);
void noteManagerRender();
void noteRenderer(const void*, NodeProxy*, bool);
bool omitModel(NodeProxy*);
bool omitView(Camera*, Scene*);
}

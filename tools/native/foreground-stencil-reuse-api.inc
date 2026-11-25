#include <cstddef>
#include <cstdint>

namespace cocos2d { namespace renderer {

class Model;
class NodeProxy;

namespace foregroundStencil {

constexpr uint32_t QuadVertexCapacity = 96;
constexpr uint32_t QuadIndexBytes = 12;

struct MaskDraw {
    const NodeProxy* node;
    const Model* clear;
    const Model* writer;
    const Model* paint;
    uint32_t source;
    uint32_t cullingMask;
    uint32_t vertexBytes;
    uint8_t vertices[QuadVertexCapacity];
    uint8_t indices[QuadIndexBytes];
};

bool begin();
bool tag(NodeProxy* node, uint32_t source);
bool end();
bool enabled();
const MaskDraw* draws(uint32_t& count);

}
}}

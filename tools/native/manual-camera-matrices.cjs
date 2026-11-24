'use strict';

const crypto = require('node:crypto');

const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const file = 'cocos/renderer/scene/RenderFlow.cpp';
const originalHash = '91e8fa68945451a6ae12b8a1324fb7e429c78dc69bd06feb3b09fbd7ae2a6f53';
const resultHash = '662450d433e2eb61af9a31baf436958b92d1df023ba444a6ded8a97523f01848';

const filteredLocalScan = `#if defined(HKD_MANUAL_MATRIX_SSE2)
        if (skipCleanSlots)
        {
            // Pool flags are contiguous, but vacant slots must stay untouched.
            constexpr uint32_t changed = WORLD_TRANSFORM_CHANGED | NODE_OPACITY_CHANGED;
            constexpr uint32_t relevant = LOCAL_TRANSFORM | changed;
            const auto wanted = _mm_set1_epi32(static_cast<int>(relevant));
            const auto zero = _mm_setzero_si128();
            const auto apply = [&](std::size_t slot) {
                auto value = dirty[slot];
                if (signData[slot].freeFlag == SPACE_FREE_FLAG || !(value & relevant)) return;

                value &= ~changed;
                if (value & LOCAL_TRANSFORM)
                {
                    auto& matrix = localMat[slot];
                    const auto& transform = trs[slot];
                    matrix.setIdentity();
                    matrix.translate(transform.x, transform.y, is3D[slot] ? transform.z : 0);
                    const auto* rotation = reinterpret_cast<const cocos2d::Quaternion*>(&transform.qx);
                    cocos2d::Mat4::createRotation(*rotation, &matTemp);
                    cocos2d::Mat4::multiply(matrix, matTemp, &matrix);
                    cocos2d::Mat4::createScale(transform.sx, transform.sy, is3D[slot] ? transform.sz : 1, &matTemp);
                    cocos2d::Mat4::multiply(matrix, matTemp, &matrix);
                    value = (value & ~LOCAL_TRANSFORM) | WORLD_TRANSFORM;
                }
                dirty[slot] = value;
            };

            std::size_t slot = 0;
            for (; slot + 4 <= contentNum; slot += 4)
            {
                const auto bits = _mm_loadu_si128(reinterpret_cast<const __m128i*>(dirty + slot));
                if (_mm_movemask_epi8(_mm_cmpeq_epi32(_mm_and_si128(bits, wanted), zero)) == 0xffff) continue;
                apply(slot);
                apply(slot + 1);
                apply(slot + 2);
                apply(slot + 3);
            }
            for (; slot < contentNum; ++slot) apply(slot);
            continue;
        }
#endif

`;

function definition() {
  const include = '#include "assembler/AssemblerSprite.hpp"';
  const localStart = 'void RenderFlow::calculateLocalMatrix(int tid)\n{';
  const scan = '        for (auto j = 0; j < contentNum; j++, localMat ++, trs ++, is3D ++, signData++, dirty++, nodeProxy++)';
  const worldStart = 'void RenderFlow::calculateLevelWorldMatrix(int tid, int stage)';
  const dispatch = '#if SUB_RENDER_THREAD_COUNT > 0\n\n        int mainThreadTid = RENDER_THREAD_COUNT - 1;';
  const dispatchEnd = '#else\n        calculateLocalMatrix();\n        calculateWorldMatrix();\n#endif';
  return {
    file,
    beforeSha256: originalHash,
    afterSha256: resultHash,
    changes: [
      { before: include, after: `${include}

#if defined(__SSE2__) || defined(_M_X64) || (defined(_M_IX86_FP) && _M_IX86_FP >= 2)
#include <emmintrin.h>
#define HKD_MANUAL_MATRIX_SSE2 1
#endif` },
      { before: localStart, after: `template <bool skipCleanSlots>
static void calculateLocalMatrices(int tid)
{
    constexpr uint32_t LOCAL_TRANSFORM = RenderFlow::LOCAL_TRANSFORM;
    constexpr uint32_t WORLD_TRANSFORM = RenderFlow::WORLD_TRANSFORM;
    constexpr uint32_t WORLD_TRANSFORM_CHANGED = RenderFlow::WORLD_TRANSFORM_CHANGED;
    constexpr uint32_t NODE_OPACITY_CHANGED = RenderFlow::NODE_OPACITY_CHANGED;` },
      { before: scan, after: filteredLocalScan + scan },
      { before: worldStart, after: `${localStart}
    calculateLocalMatrices<false>(tid);
}

${worldStart}` },
      { before: dispatch, after: `#if defined(HKD_MANUAL_MATRIX_SSE2)
        // Manual cameras still update the whole pool, including transform
        // and opacity flags needed by subsequent camera and scene draws.
        if (camera)
        {
            calculateLocalMatrices<true>(-1);
            calculateWorldMatrix();
        }
        else
        {
#endif
${dispatch}` },
      { before: dispatchEnd, after: `${dispatchEnd}
#if defined(HKD_MANUAL_MATRIX_SSE2)
        }
#endif` }
    ]
  };
}

function patchSource(before, patch = definition()) {
  if (hash(before) !== patch.beforeSha256) throw Error('Unsupported manual camera matrices source hash: ' + patch.file);
  const original = before.toString('utf8');
  let text = original.replace(/\r\n/g, '\n');
  for (const change of patch.changes) {
    if (text.split(change.before).length !== 2) throw Error('Unsupported manual camera matrices patch anchor: ' + patch.file);
    text = text.replace(change.before, () => change.after);
  }
  const after = Buffer.from(original.includes('\r\n') ? text.replace(/\n/g, '\r\n') : text);
  if (hash(after) !== patch.afterSha256) throw Error('Unexpected manual camera matrices result hash: ' + patch.file);
  return after;
}

module.exports = { definition, patchSource };

static void applyLeafWorldRow(const RenderFlow::LevelInfo& info)
{
    constexpr auto WORLD_TRANSFORM = RenderFlow::WORLD_TRANSFORM;
    constexpr auto WORLD_TRANSFORM_CHANGED = RenderFlow::WORLD_TRANSFORM_CHANGED;
    constexpr auto OPACITY = RenderFlow::OPACITY;
    constexpr auto NODE_OPACITY_CHANGED = RenderFlow::NODE_OPACITY_CHANGED;
    auto selfWorldDirty = *info.dirty & WORLD_TRANSFORM;
    auto selfOpacityDirty = *info.dirty & OPACITY;

    if (info.parentDirty)
    {
        if ((*info.parentDirty & WORLD_TRANSFORM_CHANGED) || selfWorldDirty)
        {
            cocos2d::Mat4::multiply(*info.parentWorldMat, *info.localMat, info.worldMat);
            *info.dirty |= WORLD_TRANSFORM_CHANGED;
            *info.dirty &= ~WORLD_TRANSFORM;
        }

        if ((*info.parentDirty & NODE_OPACITY_CHANGED) || selfOpacityDirty)
        {
            *info.realOpacity = *info.opacity * *info.parentRealOpacity / 255.0f;
            *info.dirty |= NODE_OPACITY_CHANGED;
            *info.dirty &= ~OPACITY;
        }
    }
    else
    {
        if (selfWorldDirty)
        {
            *info.worldMat = *info.localMat;
            *info.dirty |= WORLD_TRANSFORM_CHANGED;
            *info.dirty &= ~WORLD_TRANSFORM;
        }

        if (selfOpacityDirty)
        {
            *info.realOpacity = *info.opacity;
            *info.dirty |= NODE_OPACITY_CHANGED;
            *info.dirty &= ~OPACITY;
        }
    }
}

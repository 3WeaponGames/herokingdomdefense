namespace {

bool js_hkdForegroundStencilBegin(se::State& state)
{
    state.rval().setBoolean(state.args().empty() && cocos2d::renderer::foregroundStencil::begin());
    return true;
}
SE_BIND_FUNC(js_hkdForegroundStencilBegin)

bool js_hkdForegroundStencilTag(se::State& state)
{
    state.rval().setBoolean(false);
    const auto& args = state.args();
    if (args.size() != 2 || !args[0].isObject() || !args[1].isNumber()) return true;
    auto* proxy = args[0].toObject();
    if (!proxy || proxy->_getClass() != __jsb_cocos2d_renderer_NodeProxy_class) return true;
    const double value = args[1].toNumber();
    if (!(value >= 1 && value <= 4294967295.0)) return true;
    const auto source = static_cast<uint32_t>(value);
    if (static_cast<double>(source) != value) return true;
    auto* node = static_cast<cocos2d::renderer::NodeProxy*>(proxy->getPrivateData());
    state.rval().setBoolean(cocos2d::renderer::foregroundStencil::tag(node, source));
    return true;
}
SE_BIND_FUNC(js_hkdForegroundStencilTag)

bool js_hkdForegroundStencilEnd(se::State& state)
{
    state.rval().setBoolean(state.args().empty() && cocos2d::renderer::foregroundStencil::end());
    return true;
}
SE_BIND_FUNC(js_hkdForegroundStencilEnd)

}

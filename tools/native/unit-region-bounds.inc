
// Opt-in preview binding for live native Spine region bounds.
static bool hkdHealthSlotExcluded(const spine::String& name)
{
    const char* start = name.buffer();
    const auto matches = [](const char* text, const char* pattern) {
        for (; *pattern; ++pattern, ++text) {
            char c = *text;
            if (c >= 'A' && c <= 'Z') c += 'a' - 'A';
            if (c != *pattern) return false;
        }
        return true;
    };
    if (!start || !*start) return false;
    if (matches(start, "__fx/")) return true;
    for (const char* field = start; *field; ++field) {
        if (field != start && field[-1] != '/') continue;
        if ((matches(field, "shadow") && (!field[6] || field[6] == '/')) ||
            (matches(field, "dead") && (!field[4] || field[4] == '/')) ||
            (matches(field, "ghost") && (!field[5] || field[5] == '/'))) return true;
    }
    return false;
}

static bool js_hkdRegionBounds(se::State& s)
{
    const auto& args = s.args();
    s.rval().setNull();
    if (args.size() != 8) return true;
    if (!args[0].isObject()) return true;
    auto* object = args[0].toObject();
    if (!object || !object->getPrivateData()) return true;
    spine::SkeletonRenderer* renderer = nullptr;
    if (object->_getClass() == __jsb_spine_SkeletonAnimation_class) {
        renderer = static_cast<spine::SkeletonAnimation*>(object->getPrivateData());
    } else if (object->_getClass() == __jsb_spine_SkeletonRenderer_class) {
        renderer = static_cast<spine::SkeletonRenderer*>(object->getPrivateData());
    }
    if (!renderer) return true;
    auto* skeleton = renderer->getSkeleton();
    if (!skeleton || !args[1].isObject()) return true;
    auto* expected = args[1].toObject();
    if (!expected || expected->_getClass() != __jsb_spine_Skeleton_class || expected->getPrivateData() != skeleton) return true;
    double m[6];
    for (size_t i = 0; i < 6; i++) {
        if (!args[i + 2].isNumber()) return true;
        m[i] = args[i + 2].toDouble();
        if (!std::isfinite(m[i])) return true;
    }
    bool any = false;
    double bounds[4] = {};
    const auto include = [&](double px, double py) {
        const double x = m[0] + m[2] * px + m[4] * py;
        const double y = m[1] + m[3] * px + m[5] * py;
        if (!std::isfinite(x) || !std::isfinite(y)) return;
        if (!any) { bounds[0] = bounds[2] = x; bounds[1] = bounds[3] = y; any = true; return; }
        // Match Math.min/Math.max when two coordinates differ only by zero sign.
        if (x < bounds[0] || (x == 0 && bounds[0] == 0 && std::signbit(x))) bounds[0] = x;
        if (y < bounds[1] || (y == 0 && bounds[1] == 0 && std::signbit(y))) bounds[1] = y;
        if (x > bounds[2] || (x == 0 && bounds[2] == 0 && !std::signbit(x))) bounds[2] = x;
        if (y > bounds[3] || (y == 0 && bounds[3] == 0 && !std::signbit(y))) bounds[3] = y;
    };
    const auto includeRigid = [&](spine::Bone& bone, spine::Vector<float>& points, size_t count) {
        const double a = bone.getA(), b = bone.getB(), c = bone.getC(), d = bone.getD();
        const double x = bone.getWorldX(), y = bone.getWorldY();
        for (size_t i = 0; i < count; i += 2) {
            double vx = points[i], vy = points[i + 1];
            include(vx * a + vy * b + x, vx * c + vy * d + y);
        }
    };
    auto& slots = skeleton->getSlots();
    for (size_t i = 0; i < slots.size(); i++) {
        auto* slot = slots[i];
        if (!slot) return true;
        auto* attachment = slot->getAttachment();
        const auto& name = slot->getData().getName();
        if (name.buffer() && (strchr(name.buffer(), '\r') || strchr(name.buffer(), '\n'))) return true;
        if (!attachment || hkdHealthSlotExcluded(name) ||
            !slot->getBone().isActive() || slot->getColor().a <= .01) continue;
        if (attachment->getRTTI().isExactly(spine::RegionAttachment::rtti)) {
            auto* region = static_cast<spine::RegionAttachment*>(attachment);
            if (region->getColor().a <= .01) continue;
            auto& values = region->getOffset();
            if (values.size() != 8) return true;
            includeRigid(slot->getBone(), values, values.size());
        } else if (attachment->getRTTI().isExactly(spine::MeshAttachment::rtti)) {
            if (!(static_cast<spine::MeshAttachment*>(attachment)->getColor().a <= .01)) return true;
        }
    }
    if (any) {
        se::HandleObject value(se::Object::createPlainObject());
        value->setProperty("minX", se::Value(bounds[0]));
        value->setProperty("minY", se::Value(bounds[1]));
        value->setProperty("maxX", se::Value(bounds[2]));
        value->setProperty("maxY", se::Value(bounds[3]));
        s.rval().setObject(value);
    }
    return true;
}
SE_BIND_FUNC(js_hkdRegionBounds)



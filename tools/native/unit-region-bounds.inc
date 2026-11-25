
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


// A private trial uses the JS health-bounds arithmetic on live native mesh
// storage. Spine's computeWorldVertices uses float intermediates instead.
static double hkdHealthDeform(spine::Vector<float>& deform, size_t index)
{
    if (index >= deform.size()) return 0.0;
    const double value = deform[index];
    // JavaScript's deform[index] || 0 keeps infinities but replaces NaN and
    // both signs of zero with positive zero.
    return value != 0.0 && !std::isnan(value) ? value : 0.0;
}

template<class Include, class Rigid>
static bool hkdIncludeHealthMesh(spine::Skeleton& skeleton, spine::Slot& slot,
    spine::MeshAttachment& mesh, const Include& include, const Rigid& rigid)
{
    auto& vertices = mesh.getVertices();
    auto& deform = slot.getDeform();
    const size_t count = mesh.getWorldVerticesLength();
    if (!count || count % 2 || !vertices.size()) return false;
    if (vertices.size() == count) {
        if (deform.size() && deform.size() != count) return false;
        rigid(slot.getBone(), deform.size() ? deform : vertices, count);
        return true;
    }

    auto& weights = mesh.getBones();
    auto& bones = skeleton.getBones();
    if (!weights.size() || vertices.size() % 3 || deform.size() % 2 ||
        deform.size() / 2 > vertices.size() / 3) return false;
    size_t weightIndex = 0, vertexIndex = 0, deformIndex = 0, found = 0;
    while (weightIndex < weights.size()) {
        const size_t influences = weights[weightIndex++];
        if (!influences || found >= count / 2 || influences > weights.size() - weightIndex ||
            influences > (vertices.size() - vertexIndex) / 3) return false;
        double x = 0.0, y = 0.0;
        for (size_t n = 0; n < influences; ++n, vertexIndex += 3, deformIndex += 2) {
            const size_t boneIndex = weights[weightIndex++];
            if (boneIndex >= bones.size() || !bones[boneIndex]) return false;
            auto& bone = *bones[boneIndex];
            const double vx = static_cast<double>(vertices[vertexIndex]) + hkdHealthDeform(deform, deformIndex);
            const double vy = static_cast<double>(vertices[vertexIndex + 1]) + hkdHealthDeform(deform, deformIndex + 1);
            const double weight = vertices[vertexIndex + 2];
            x += (vx * bone.getA() + vy * bone.getB() + bone.getWorldX()) * weight;
            y += (vx * bone.getC() + vy * bone.getD() + bone.getWorldY()) * weight;
        }
        ++found;
        include(x, y);
    }
    return found == count / 2 && vertexIndex == vertices.size();
}

static bool js_hkdRegionBounds(se::State& s)
{
    const auto& args = s.args();
    s.rval().setNull();
    if (args.size() != 8 && args.size() != 9) return true;
    if (args.size() == 9 && !args[8].isBoolean()) return true;
    const bool includeMeshes = args.size() == 9 && args[8].toBoolean();
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
            auto* mesh = static_cast<spine::MeshAttachment*>(attachment);
            if (mesh->getColor().a <= .01) continue;
            if (!includeMeshes || !hkdIncludeHealthMesh(*skeleton, *slot, *mesh, include, includeRigid)) return true;
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

static bool js_hkdSampleOneDepthBounds(se::State& s)
{
    s.rval().setBoolean(false);
    const auto& args = s.args();
    if (args.size() != 4 || !args[0].isObject() || !args[1].isObject() ||
        !args[2].isBoolean() || !args[3].isObject()) return true;
    auto* object = args[0].toObject();
    auto* expected = args[1].toObject();
    auto* output = args[3].toObject();
    if (!object || !object->getPrivateData() ||
        !expected || expected->_getClass() != __jsb_spine_Skeleton_class ||
        !output || !output->isTypedArray() ||
        output->getTypedArrayType() != se::Object::TypedArrayType::FLOAT32) return true;

    spine::SkeletonRenderer* renderer = nullptr;
    if (object->_getClass() == __jsb_spine_SkeletonAnimation_class)
        renderer = static_cast<spine::SkeletonAnimation*>(object->getPrivateData());
    else if (object->_getClass() == __jsb_spine_SkeletonRenderer_class)
        renderer = static_cast<spine::SkeletonRenderer*>(object->getPrivateData());
    if (!renderer) return true;
    auto* skeleton = renderer->getSkeleton();
    if (!skeleton || expected->getPrivateData() != skeleton) return true;

    // The JS path handles bounds that exclude the authored light attachments.
    auto& slots = skeleton->getSlots();
    if (slots.size()) {
        auto* last = slots[slots.size() - 1];
        if (!last) return true;
        const char* name = last->getData().getName().buffer();
        if (name && (!std::strcmp(name, "building_aperture_rays") ||
                     !std::strcmp(name, "building_aperture_cores"))) return true;
    }

    uint8_t* data = nullptr;
    size_t size = 0;
    if (!output->getTypedArrayData(&data, &size) || !data || size != 4 * sizeof(float)) return true;
    if (args[2].toBoolean()) skeleton->updateWorldTransform();
    const auto rect = renderer->getBoundingBox();
    const float values[] = {rect.origin.x, rect.origin.y, rect.size.width, rect.size.height};
    std::memcpy(data, values, sizeof(values));
    s.rval().setBoolean(true);
    return true;
}
SE_BIND_FUNC(js_hkdSampleOneDepthBounds)



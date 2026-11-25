// Private, observational inventory of initialized native realtime rigs.
// Kept independent of schedule order and enable/disable transitions.
namespace hkd_spine_inventory {
using LiveSet = std::unordered_set<spine::SkeletonRenderer*>;

LiveSet& live()
{
    // Some native renderer destructors run during host shutdown. Keep the
    // one registry object alive for that process lifetime.
    static auto* items = new LiveSet();
    return *items;
}
} // namespace hkd_spine_inventory

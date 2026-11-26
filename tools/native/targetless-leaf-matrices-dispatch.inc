            using namespace hkdTargetlessLeafMatrices;
            // The original middleware Update has already run. Keep all later
            // render and fallbacks in this same native dispatch.
            const bool eligible = !selecting && targetless.ticket && !targetless.physical &&
                !targetless.failed && registry.safe && registry.flow == this &&
                registry.memory == NodeMemPool::getInstance();
            if (!eligible) {
                calculateLocalMatrices<true>(-1);
                calculateWorldMatrix();
            } else {
                Selection selected;
                {
                    SelectScope scan(&selected);
                    calculateLocalMatrices<true, true>(-1);
                }
                if (!selected.ready()) {
                    calculateWorldMatrix();
                } else {
                    for (std::size_t row = 0; row < selected.count; ++row)
                        applyLeafWorldRow(selected.rows[row]->info);
                }
            }

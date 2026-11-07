'use strict';
const os = require('node:os'), path = require('node:path');

function artifactRoot() {
  if (process.env.HKD_ARTIFACT_DIR) return path.resolve(process.env.HKD_ARTIFACT_DIR);
  if (process.env.RUNNER_TEMP) return path.join(process.env.RUNNER_TEMP, 'HeroKingdomDefense');
  return path.join(os.homedir(), 'Documents', 'Codex Artifacts', 'HeroKingdomDefense');
}

module.exports = { artifactRoot, reportPath: (...parts) => path.join(artifactRoot(), ...parts) };

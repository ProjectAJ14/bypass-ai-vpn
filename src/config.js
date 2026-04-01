const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_PATH = path.join(os.homedir(), '.bypass-vpn.json');

function loadConfig() {
  try {
    const data = fs.readFileSync(CONFIG_PATH, 'utf8');
    const config = JSON.parse(data);
    return { domains: Array.isArray(config.domains) ? config.domains : [] };
  } catch {
    return { domains: [] };
  }
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
}

function addDomain(domain) {
  const config = loadConfig();
  if (!config.domains.includes(domain)) {
    config.domains.push(domain);
    saveConfig(config);
  }
}

function removeDomain(domain) {
  const config = loadConfig();
  config.domains = config.domains.filter((d) => d !== domain);
  saveConfig(config);
}

module.exports = { loadConfig, addDomain, removeDomain };

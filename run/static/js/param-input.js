function updateYAMLFromHash(parsedContent, hash, addHashKeys) {
    // Sets nested yaml values for textbox while preserving existing structure
    function setNestedValue(obj, path, value) {
        const keys = path.split('.');
        let current = obj;

        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            // Preserve existing object or create new one if doesn't exist
            current[key] = current[key] || {};
            current = current[key];
        }

        // Set the value at the final key
        const lastKey = keys[keys.length - 1];
        current[lastKey] = value;
    }

    // Helper function to handle comma-separated values, including encrypted commas
    function handleCommaSeparatedValue(value) {
        if (typeof value === 'string' && value.includes('%2C')) {
            return value.split('%2C').map(item => item.trim());
        } else if (typeof value === 'string' && value.includes(',')) {
            return value.split(',').map(item => item.trim());
        }
        return value;
    }

    // Check if a path should be included based on addHashKeys
    function shouldIncludePath(path) {
        const rootKey = path.split('.')[0];
        return addHashKeys.includes(rootKey);
    }

    // Traverse hash and update parsedContent
    function traverseAndUpdate(obj, prefix = '') {
        Object.keys(obj).forEach(key => {
            const currentPath = prefix ? `${prefix}.${key}` : key;

            // Skip if this path doesn't match our allowed root keys
            if (!shouldIncludePath(currentPath)) {
                return;
            }

            if (typeof obj[key] === 'object' && obj[key] !== null) {
                // If value is an object, recurse deeper
                traverseAndUpdate(obj[key], currentPath);
            } else {
                // Process value for comma-separated strings
                const processedValue = handleCommaSeparatedValue(obj[key]);
                // Update the parsedContent with the processed value
                setNestedValue(parsedContent, currentPath, processedValue);
            }
        });
    }

    // Start the traversal
    traverseAndUpdate(hash);
    return parsedContent;
}

function parseHashParams() {
    const hash = window.location.hash.substring(1);
    const params = {};
    hash.split('&').forEach(pair => {
      const [key, value] = pair.split('=');
      if (key) params[key] = decodeURIComponent(value || '');
    });
    return params;
  }

  function displayParams(obj) {
    const paramDiv = document.getElementById('params');
    if (!obj || Object.keys(obj).length === 0) {
      paramDiv.style.display = 'none';
      return;
    }
    paramDiv.style.display = 'block';
    paramDiv.textContent = 'Parameters:\n' + JSON.stringify(obj, null, 2);
  }

document.addEventListener('DOMContentLoaded', function() {
  loadParamText();
  function loadParamText() {

    const paramTextDiv = document.getElementById('paramText');
    const preTag = paramTextDiv.querySelector('pre');
    let preContent = preTag.innerHTML;

    let hash = getHash();
    console.log("hash:");
    console.log(hash);
    //alert(hash.features) // Work regardless of hash
    console.log(hash.features?.dcid)

    modelHashParams = ["features", "targets", "models"];
    insertHashValues(modelHashParams);
    function insertHashValues(modelHashParams) {
      // Main execution
      const addHashKeys = ["features", "targets", "models"];
      let parsedContent = parseYAML(preContent);
      parsedContent = updateYAMLFromHash(parsedContent, hash, addHashKeys);
      preContent = convertToYAML(parsedContent);
      preTag.innerHTML = preContent;
      //alert(preContent)
    }

    // Helper function to parse YAML into a JavaScript object
    function parseYAML(yamlString) {
      // You can use a library like js-yaml for this
      yamlString = yamlString.replace(/<b>|<\/b>/g, '');
      //console.log("yamlString");
      //console.log(yamlString);
      return jsyaml.load(yamlString);
    }

    // Helper function to convert a JavaScript object to YAML
    function convertToYAML(obj) {
      return jsyaml.dump(obj, {
        lineWidth: -1, // Prevents folding of long lines
        noCompatMode: true // Ensures compatibility with plain strings
      });
    }
  }
});



// Parse YAML content from the #paramText element
function parseYamlContent() {
    const paramTextElement = document.getElementById('paramText');
    const yamlContent = paramTextElement.textContent || paramTextElement.innerText;
    return yamlContent;
}

// Function to convert YAML to URL parameters
function yamlToUrlParams(yamlStr) {
    // Simple YAML parser for this specific format
    const lines = yamlStr.split('\n');
    const params = {};
    let currentKey = null;

    for (const line of lines) {
        if (line.trim() === '' || line.trim().startsWith('#')) continue;

        const indent = line.search(/\S|$/);
        const colonIndex = line.indexOf(':');

        if (colonIndex > 0) {
            const key = line.substring(0, colonIndex).trim();
            let value = line.substring(colonIndex + 1).trim();

            if (indent === 0) {
                // Top level key
                currentKey = key;
                if (value) {
                    params[key] = value;
                } else {
                    params[key] = {};
                }
            } else if (indent > 0 && currentKey) {
                // Sub-key - ensure we have an object to add to
                if (typeof params[currentKey] !== 'object' || Array.isArray(params[currentKey])) {
                    params[currentKey] = {};
                }

                if (value) {
                    params[currentKey][key] = value;
                } else {
                    params[currentKey][key] = {};
                }
            }
        } else if (line.trim().startsWith('-')) {
            // Handle array items
            const value = line.trim().substring(1).trim();

            if (!Array.isArray(params[currentKey])) {
                params[currentKey] = [];
            }
            params[currentKey].push(value);
        }
    }

    // Convert to URL hash format with proper nesting and URL encoding
    const hashParams = [];

    function addParams(obj, prefix = '') {
        for (const [key, value] of Object.entries(obj)) {
            const paramKey = prefix ? `${prefix}.${key}` : key;

            if (typeof value === 'string') {
                hashParams.push(`${paramKey}=${encodeURIComponent(value)}`);
            } else if (Array.isArray(value)) {
                // OLD (encodes commas):
                //hashParams.push(`${paramKey}=${encodeURIComponent(value.join(','))}`);

                // NEW (preserves commas):
                const joinedValues = value.map(v => encodeURIComponent(v)).join(',');
                hashParams.push(`${paramKey}=${joinedValues}`);

            } else if (typeof value === 'object' && value !== null) {
                // Recursively handle nested objects
                addParams(value, paramKey);
            }
        }
    }

    addParams(params);

    const result = hashParams.join('&');
    console.log("Generated URL parameters:", result);
    return result;
}

// Get model parameters from textbox and pass forward in hash.
function goToPage(whatPage) { // Used by RealityStream/index.html
    // Get YAML content and convert to URL parameters
    const yamlContent = parseYamlContent();
    const urlParams = yamlToUrlParams(yamlContent);

    window.location.href = whatPage + "#" + urlParams;
}

/* eslint-disable no-var */
/* Frontend tag logic for hierarchy-aware filtering. Loaded before app.js. */
var TagUtils = (function () {
  'use strict';

  var _hierarchy = {};
  var _loaded = false;

  function load(url) {
    return fetch(url ?? 'data/tags.json')
      .then(function (res) {
        if (!res.ok) return;
        return res.json().then(function (data) {
          _hierarchy = data.hierarchy ?? {};
          _loaded = true;
        });
      })
      .catch(function () {});
  }

  function isLoaded() {
    return _loaded;
  }

  function getDescendants(tag) {
    var result = new Set([tag]);
    var children = _hierarchy[tag];
    if (children) {
      for (var i = 0; i < children.length; i++) {
        getDescendants(children[i]).forEach(function (d) { result.add(d); });
      }
    }
    return result;
  }

  function expandFilters(activeFilters) {
    var expanded = new Set();
    activeFilters.forEach(function (f) {
      getDescendants(f).forEach(function (d) { expanded.add(d); });
    });
    return expanded;
  }

  function getParentTags() {
    return Object.keys(_hierarchy);
  }

  return {
    load: load,
    isLoaded: isLoaded,
    expandFilters: expandFilters,
    getParentTags: getParentTags,
  };
})();
if (typeof globalThis !== 'undefined') globalThis.TagUtils = TagUtils;

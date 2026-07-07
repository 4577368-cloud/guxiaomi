/**
 * 紫微命盘档案：本地多份保存与切换
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'ziwei_profiles_v1';
  var ACTIVE_KEY = 'ziwei_active_profile_id';
  var MAX_PROFILES = 30;

  function nowIso() {
    return new Date().toISOString();
  }

  function loadProfiles() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var list = JSON.parse(raw);
      if (!Array.isArray(list)) return [];
      return list.filter(function (p) {
        return p && p.id && p.birthDate;
      });
    } catch (e) {
      console.error('[ZiweiProfileStorage] load failed', e);
      return [];
    }
  }

  function saveProfiles(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_PROFILES)));
      return true;
    } catch (e) {
      console.error('[ZiweiProfileStorage] save failed', e);
      return false;
    }
  }

  function getActiveProfileId() {
    try {
      return localStorage.getItem(ACTIVE_KEY) || '';
    } catch (_) {
      return '';
    }
  }

  function setActiveProfileId(id) {
    try {
      if (id) localStorage.setItem(ACTIVE_KEY, id);
      else localStorage.removeItem(ACTIVE_KEY);
    } catch (_) {}
  }

  function getActiveProfile() {
    var id = getActiveProfileId();
    if (!id) return null;
    return loadProfiles().find(function (p) { return p.id === id; }) || null;
  }

  function upsertProfile(profile) {
    var list = loadProfiles();
    var idx = list.findIndex(function (p) { return p.id === profile.id; });
    var next = Object.assign({}, profile, { updatedAt: nowIso() });
    if (!next.createdAt) next.createdAt = next.updatedAt;
    if (idx >= 0) list[idx] = next;
    else list.unshift(next);
    saveProfiles(list);
    setActiveProfileId(next.id);
    return next;
  }

  function deleteProfile(id) {
    var list = loadProfiles().filter(function (p) { return p.id !== id; });
    saveProfiles(list);
    if (getActiveProfileId() === id) {
      setActiveProfileId(list[0] ? list[0].id : '');
    }
    return list;
  }

  function createEmptyProfile() {
    return {
      id: 'zp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      name: '',
      gender: 'male',
      birthDate: '1990-01-01',
      birthTime: '12:00',
      province: '北京',
      city: '北京',
      longitude: 116.4,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
  }

  global.ZiweiProfileStorage = {
    STORAGE_KEY: STORAGE_KEY,
    MAX_PROFILES: MAX_PROFILES,
    loadProfiles: loadProfiles,
    saveProfiles: saveProfiles,
    getActiveProfileId: getActiveProfileId,
    setActiveProfileId: setActiveProfileId,
    getActiveProfile: getActiveProfile,
    upsertProfile: upsertProfile,
    deleteProfile: deleteProfile,
    createEmptyProfile: createEmptyProfile,
  };
})(typeof window !== 'undefined' ? window : globalThis);

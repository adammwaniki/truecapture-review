// Reads the DeDi reference assertion embedded at sign time (label
// `org.truecapture.dedi`) from a manifest store, or null if absent/incomplete.
// Called only when a manifest exists, so the active manifest is present.
export function extractDediRef(manifestStore) {
  const active = manifestStore.manifests[manifestStore.active_manifest];
  const assertion = (active.assertions || []).find((a) => a.label === 'org.truecapture.dedi');
  if (!assertion) return null;
  const d = assertion.data || {};
  if (!d.record_id || !d.namespace || !d.registry) return null;
  return { recordId: d.record_id, namespace: d.namespace, registry: d.registry };
}

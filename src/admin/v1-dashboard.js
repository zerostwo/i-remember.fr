export function mergeV1Dashboard(payload, dashboard) {
  if (!dashboard) return payload;
  return {
    ...payload,
    counts: {
      ...(payload.counts || {}),
      pendingMemory: dashboard.pendingMemories,
      publishedMemory: dashboard.publishedMemories,
      archivedMemory: dashboard.archivedMemories,
      rejectedMemory: dashboard.rejectedMemories,
      users: dashboard.totalUsers,
    },
    v1Dashboard: dashboard,
  };
}

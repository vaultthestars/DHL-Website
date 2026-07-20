import { isWebDeployment } from "./runtime";
import { ClusterCenterOverrides } from "./types";

export const syncClusterLayoutToServer = async (overrides: ClusterCenterOverrides): Promise<void> => {
  if (isWebDeployment) {
    return;
  }

  try {
    await fetch("/api/cluster-layout", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(overrides),
    });
  } catch {
    // Local server may not be running during static preview.
  }
};

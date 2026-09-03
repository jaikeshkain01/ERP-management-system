/**
 * Legacy /pcb-management/list — retired at the module-consolidation slice
 * in favour of the universal items master filtered by itemType. The old
 * URL is preserved so bookmarks keep working; every hit server-redirects
 * to /items/list?itemType=semi_assembled.
 */
import { redirect } from "next/navigation";

export default function PcbManagementListRedirect() {
  redirect("/items/list?itemType=semi_assembled");
}

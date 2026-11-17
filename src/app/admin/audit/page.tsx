import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { Container } from "@/components/layout/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireAdmin } from "@/lib/auth/staff";
import { AuditViewer } from "./AuditViewer";

export const metadata: Metadata = { title: "Audit log · Admin", robots: { index: false } };

export default async function AdminAuditPage() {
  await requireAdmin("/admin/audit");
  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Audit log"
        description="Every privileged action, who took it and why. Entries cannot be edited or deleted. Moderators cannot see this log."
      />
      <Container>
        <div className="section section--tight stack stack--lg">
          <AdminNav current="/admin/audit" />
          <AuditViewer />
        </div>
      </Container>
    </>
  );
}

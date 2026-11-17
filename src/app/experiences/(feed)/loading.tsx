import { Container } from "@/components/layout/Container";
import { LoadingState } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <Container>
      <div className="section">
        <LoadingState label="Loading page" />
      </div>
    </Container>
  );
}

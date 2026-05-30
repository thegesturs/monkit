import { ScrollText } from "lucide-react";

import { Button } from "../ui/button.tsx";
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "../ui/empty.tsx";

/**
 * Contracts (ABI-driven read/write) needs a server-side ABI registry plus
 * monad.read / monad.write RPCs signed through the wallet service — not built
 * yet. Render an honest empty state rather than a fake panel.
 */
export function ContractsPanel(): React.ReactElement {
  return (
    <Empty className="py-10">
      <EmptyMedia variant="icon">
        <ScrollText />
      </EmptyMedia>
      <EmptyTitle>Contract interaction is coming soon</EmptyTitle>
      <EmptyDescription>
        Once you deploy a contract, this panel will read its ABI and give you a
        form to call read and write functions directly — no copy-pasting ABIs.
      </EmptyDescription>
      <Button className="mt-2" size="sm" disabled>
        Deploy a contract first
      </Button>
    </Empty>
  );
}

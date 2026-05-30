import { Effect } from "effect";
import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

import type { WalletMetadata } from "@memoize/wire";

import { getRpcClient } from "../../lib/rpc-client.ts";
import { Button } from "../ui/button.tsx";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog.tsx";
import { truncateAddress } from "./lib/format.ts";

export function SignMessageDialog({
  wallet,
  onClose,
}: {
  wallet: WalletMetadata | null;
  onClose: () => void;
}): React.ReactElement {
  const [message, setMessage] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [copied, setCopied] = useState(false);

  // Reset transient state whenever the target wallet changes.
  useEffect(() => {
    setMessage("");
    setSignature(null);
    setError(null);
    setSigning(false);
  }, [wallet?.address]);

  const sign = async () => {
    if (wallet === null || message.trim() === "") return;
    setSigning(true);
    setError(null);
    setSignature(null);
    try {
      const client = await getRpcClient();
      const sig = await Effect.runPromise(
        client.monad["wallet.signMessage"]({
          address: wallet.address,
          message,
        }),
      );
      setSignature(sig);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSigning(false);
    }
  };

  const copySig = () => {
    if (signature === null) return;
    void navigator.clipboard.writeText(signature);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <Dialog open={wallet !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle>Sign a message</DialogTitle>
          <DialogDescription>
            Signed with{" "}
            <span className="font-mono">
              {wallet ? truncateAddress(wallet.address) : ""}
            </span>
            . No transaction is sent and no gas is spent.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 px-6 pb-6">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Message to sign…"
            rows={3}
            className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none ring-ring/24 transition-shadow placeholder:text-muted-foreground/72 focus-visible:border-ring focus-visible:ring-[3px]"
          />

          {error !== null ? (
            <p className="rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive-foreground">
              {error}
            </p>
          ) : null}

          {signature !== null ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground">
                  Signature
                </span>
                <button
                  type="button"
                  onClick={copySig}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  {copied ? (
                    <Check className="size-3 text-success" />
                  ) : (
                    <Copy className="size-3" />
                  )}
                  Copy
                </button>
              </div>
              <code className="block max-h-28 overflow-y-auto break-all rounded-lg bg-muted/60 p-2.5 font-mono text-[11px] text-foreground">
                {signature}
              </code>
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
            <Button
              size="sm"
              loading={signing}
              disabled={message.trim() === ""}
              onClick={() => void sign()}
            >
              Sign message
            </Button>
          </div>
        </div>
      </DialogPopup>
    </Dialog>
  );
}

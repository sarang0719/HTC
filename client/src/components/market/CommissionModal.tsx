import React from "react";
import { Zap, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";

interface CommissionModalProps {
  open: boolean;
  onAgree: () => void;
  onDeny: () => void;
}

export const CommissionModal: React.FC<CommissionModalProps> = ({ open, onAgree, onDeny }) => {
  return (
    <Dialog open={open} onOpenChange={(val) => !val && onDeny()}>
      <DialogContent className="max-w-md bg-background border-border/40 shadow-2xl overflow-hidden rounded-2xl">
        <DialogHeader className="p-2">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-2 border border-primary/20">
            <Zap className="w-8 h-8 text-primary" />
          </div>
          <DialogTitle className="text-xl font-bold text-center text-white">Smart Auto-Invest Access</DialogTitle>
          <DialogDescription className="text-center text-muted-foreground text-sm leading-relaxed px-4">
            To enable our institutional AI Quant algorithms, a <span className="text-primary font-bold">10% Company Commission</span> is applied on each investment amount. This fee ensures our high-performance infrastructure remains cutting-edge.
          </DialogDescription>
        </DialogHeader>
        <div className="bg-card px-6 py-4 border-y border-border/10 space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
              <CheckCircle className="w-3 h-3 text-emerald-400" />
            </div>
            <p className="text-xs text-foreground font-medium">97.4% High-Accuracy Signals</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
              <CheckCircle className="w-3 h-3 text-emerald-400" />
            </div>
            <p className="text-xs text-foreground font-medium">Iterative $50/45/35 Round Sequence</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
              <CheckCircle className="w-3 h-3 text-emerald-400" />
            </div>
            <p className="text-xs text-foreground font-medium">Automatic 10% Infrastructure Fee</p>
          </div>
        </div>
        <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2 px-6 pb-6">
          <Button variant="outline" onClick={onDeny} className="flex-1 h-11 border-border/40 text-muted-foreground hover:bg-white/5 font-bold uppercase text-[11px] tracking-wider">
            Decline
          </Button>
          <Button onClick={onAgree} className="flex-1 h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase text-[11px] tracking-wider shadow-lg shadow-primary/20">
            Agree & Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CommissionModal;

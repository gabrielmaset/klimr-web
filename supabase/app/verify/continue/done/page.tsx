import { ShieldCheck } from "lucide-react";
import { KlimrLogo } from "@/components/logo";

export const metadata = { title: "Verification requested · Klimr" };

export default function VerifyDone() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-10">
      <div className="flex justify-center">
        <KlimrLogo />
      </div>
      <div className="mt-10 rounded-3xl border border-[#CFE3D2] bg-[#EFF7F0] p-6 text-center shadow-e1">
        <ShieldCheck size={24} className="mx-auto text-[#1F6B33]" aria-hidden />
        <p className="mt-2 text-lg font-bold text-[#1F6B33]">You&rsquo;re in the review queue</p>
        <p className="mt-1.5 text-[14px] leading-relaxed text-[#2B5E3A]">
          Most reviews clear within a day — you&rsquo;ll get an email the moment yours does. You can close this tab and finish anything left on your other device.
        </p>
      </div>
    </div>
  );
}

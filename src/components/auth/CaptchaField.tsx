import Image from "next/image";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CAPTCHA_CODE_LENGTH } from "@/lib/captcha-policy";

export function CaptchaField({
  image,
  code,
  loading,
  inputId = "graphical-captcha",
  onCodeChange,
  onRefresh,
}: {
  image: string;
  code: string;
  loading: boolean;
  inputId?: string;
  onCodeChange: (value: string) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>图形验证码</Label>
      <div className="flex items-stretch gap-2">
        <Input
          id={inputId}
          value={code}
          onChange={(event) => onCodeChange(event.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, CAPTCHA_CODE_LENGTH))}
          placeholder="输入图中字符"
          autoComplete="off"
          maxLength={CAPTCHA_CODE_LENGTH}
          className="min-w-0 uppercase"
          disabled={loading}
          required
        />
        <div className="flex h-12 w-[145px] shrink-0 items-center justify-center overflow-hidden rounded-md border bg-slate-50">
          {image
            ? <Image src={image} alt="图形验证码" width={145} height={48} unoptimized className="h-12 w-[145px] object-contain" />
            : <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
        </div>
        <Button type="button" variant="outline" size="icon" className="h-12 w-12 shrink-0" onClick={onRefresh} title="换一张验证码" aria-label="换一张验证码">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

// src/ui/badge.tsx
import { cva } from "class-variance-authority";
import { jsx } from "react/jsx-runtime";
var badgeVariants = cva(
  "inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset",
  {
    variants: {
      variant: {
        default: "bg-secondary text-secondary-foreground",
        success: "bg-green-50 text-green-700 ring-green-600/20",
        warning: "bg-yellow-50 text-yellow-700 ring-yellow-600/20",
        error: "bg-red-50 text-red-700 ring-red-600/20"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);
function Badge({ className, variant, ...props }) {
  return /* @__PURE__ */ jsx("div", { className: `${badgeVariants({ variant })} ${className ?? ""}`, ...props });
}
export {
  Badge,
  badgeVariants
};
//# sourceMappingURL=badge.js.map
import React from "react";

export function BrandMark({ size = 24 }: { size?: number }): React.JSX.Element {
  return <img className="brand-logo" src="/snap/assets/brand/icon.png" width={size} height={size} alt="" aria-hidden="true" />;
}

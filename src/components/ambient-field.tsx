import { useId } from "react";

/** A separate artwork layer beneath the transparent 3D canvas. No animation or external assets. */
export function AmbientField({ intensity }: { intensity: number }) {
  const id = useId().replace(/:/g, "");
  return <div className="ambient-field" style={{ opacity: intensity }} aria-hidden="true">
    <svg viewBox="0 0 1200 900" preserveAspectRatio="none" focusable="false">
      <defs>
        <radialGradient id={`${id}-violet`}>
          <stop stopColor="#8163b2" stopOpacity=".9" /><stop offset=".48" stopColor="#a394ca" stopOpacity=".65" /><stop offset="1" stopColor="#bdb3d9" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-blue`}>
          <stop stopColor="#4b68c0" stopOpacity=".9" /><stop offset=".42" stopColor="#8da5dc" stopOpacity=".6" /><stop offset="1" stopColor="#b9cfe1" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-warm`}>
          <stop stopColor="#e79171" stopOpacity=".78" /><stop offset=".45" stopColor="#d7a1af" stopOpacity=".48" /><stop offset="1" stopColor="#d7a1af" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-light`}>
          <stop stopColor="#f7f3e7" stopOpacity=".88" /><stop offset="1" stopColor="#f7f3e7" stopOpacity="0" />
        </radialGradient>
        <filter id={`${id}-warp`} x="-25%" y="-25%" width="150%" height="150%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency=".004 .006" numOctaves="2" seed="17" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="95" xChannelSelector="R" yChannelSelector="G" />
          <feGaussianBlur stdDeviation="18" />
        </filter>
        <filter id={`${id}-grain`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency=".72" numOctaves="3" stitchTiles="stitch" seed="31" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </defs>
      <g filter={`url(#${id}-warp)`}>
        <ellipse cx="140" cy="250" rx="660" ry="510" fill={`url(#${id}-violet)`} />
        <ellipse cx="1030" cy="700" rx="670" ry="480" fill={`url(#${id}-violet)`} />
        <ellipse cx="830" cy="100" rx="540" ry="300" fill={`url(#${id}-blue)`} transform="rotate(-18 830 100)" />
        <ellipse cx="290" cy="730" rx="590" ry="240" fill={`url(#${id}-blue)`} transform="rotate(-25 290 730)" />
        <ellipse cx="1070" cy="300" rx="360" ry="300" fill={`url(#${id}-warm)`} />
        <ellipse cx="340" cy="620" rx="300" ry="170" fill={`url(#${id}-warm)`} transform="rotate(-25 340 620)" />
        <ellipse cx="600" cy="410" rx="460" ry="360" fill={`url(#${id}-light)`} />
      </g>
      <rect width="1200" height="900" filter={`url(#${id}-grain)`} opacity=".115" style={{ mixBlendMode: "soft-light" }} />
    </svg>
  </div>;
}

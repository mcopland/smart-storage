// glyphs.jsx — abstract item glyphs (two style variants: line + solid)

function Glyph({ kind, style, color, w = 1, h = 1, cell = 56 }) {
  // viewbox follows footprint dimensions
  const vbW = w * 100;
  const vbH = h * 100;
  const cx = vbW / 2;
  const cy = vbH / 2;
  const r = Math.min(vbW, vbH) * 0.32;
  const stroke = color;
  const fill = style === "solid" ? color : "none";
  const strokeWidth = style === "solid" ? 0 : 5;

  let shape = null;
  switch (kind) {
    case "hex": {
      const pts = [];
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        pts.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`);
      }
      shape = (
        <polygon points={pts.join(" ")} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
      );
      break;
    }
    case "diamond": {
      shape = (
        <polygon
          points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
        />
      );
      break;
    }
    case "tri": {
      // for 2x1 conduit, use a stretched triangle pointing right
      if (w === 2 && h === 1) {
        const pad = 18;
        shape = (
          <polygon
            points={`${pad},${cy - 24} ${vbW - pad},${cy} ${pad},${cy + 24}`}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
        );
      } else if (h === 2 && w === 1) {
        const pad = 18;
        shape = (
          <polygon
            points={`${cx - 24},${pad} ${cx},${vbH - pad} ${cx + 24},${pad}`}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
        );
      } else {
        shape = (
          <polygon
            points={`${cx},${cy - r} ${cx + r * 0.95},${cy + r * 0.6} ${cx - r * 0.95},${cy + r * 0.6}`}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
        );
      }
      break;
    }
    case "rect": {
      const pad = 22;
      shape = (
        <rect
          x={pad}
          y={pad}
          width={vbW - pad * 2}
          height={vbH - pad * 2}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          rx={6}
        />
      );
      break;
    }
    case "circle": {
      shape = <circle cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
      break;
    }
    case "pent": {
      // 1x2 shield — vertical pentagon
      const padX = 18,
        top = 16,
        bot = vbH - 16;
      const mid = top + (bot - top) * 0.35;
      shape = (
        <polygon
          points={`${cx},${top} ${vbW - padX},${mid} ${vbW - padX - 4},${bot} ${padX + 4},${bot} ${padX},${mid}`}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
        />
      );
      break;
    }
    case "star": {
      const pts = [];
      for (let i = 0; i < 5; i++) {
        const aOuter = ((Math.PI * 2) / 5) * i - Math.PI / 2;
        pts.push(`${cx + r * Math.cos(aOuter)},${cy + r * Math.sin(aOuter)}`);
        const aInner = aOuter + Math.PI / 5;
        pts.push(`${cx + r * 0.42 * Math.cos(aInner)},${cy + r * 0.42 * Math.sin(aInner)}`);
      }
      shape = (
        <polygon points={pts.join(" ")} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
      );
      break;
    }
    case "cross": {
      const arm = r * 0.35;
      const len = r * 0.95;
      shape = (
        <polygon
          points={`${cx - arm},${cy - len} ${cx + arm},${cy - len} ${cx + arm},${cy - arm} ${cx + len},${cy - arm} ${cx + len},${cy + arm} ${cx + arm},${cy + arm} ${cx + arm},${cy + len} ${cx - arm},${cy + len} ${cx - arm},${cy + arm} ${cx - len},${cy + arm} ${cx - len},${cy - arm} ${cx - arm},${cy - arm}`}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
        />
      );
      break;
    }
    default:
      shape = <circle cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
  }

  // 'glyph' style = stroked, 'solid' style = filled, 'dot' style = small filled with ring
  if (style === "dot") {
    return (
      <svg viewBox={`0 0 ${vbW} ${vbH}`} width="100%" height="100%" style={{ display: "block" }}>
        <circle cx={cx} cy={cy} r={r * 0.92} fill="none" stroke={color} strokeWidth={2} opacity={0.35} />
        <circle cx={cx} cy={cy} r={r * 0.45} fill={color} />
      </svg>
    );
  }

  return (
    <svg viewBox={`0 0 ${vbW} ${vbH}`} width="100%" height="100%" style={{ display: "block" }}>
      {shape}
    </svg>
  );
}

window.Glyph = Glyph;

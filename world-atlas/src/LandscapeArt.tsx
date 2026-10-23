import { useId } from "react";
import type { LandscapeStyle } from "./landscapes";

function House({
  x,
  y,
  s = 1,
  roof = "#54796b",
}: {
  x: number;
  y: number;
  s?: number;
  roof?: string;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="m0 2 22 9v20L0 22Z" fill="#d8ceb1" />
      <path d="m22 11 21-12v20L22 31Z" fill="#b8b89b" />
      <path d="m-7 3 22-14L49 0 24 16Z" fill={roof} />
      <path d="m-7 3 22-14 8 15 26-4-25 16Z" fill="#ffffff13" />
      <path d="m4 12 6 3v7l-6-2Zm10 4 5 2v8l-5-2Z" fill="#a38a59" />
      <path d="m28 16 6-3v8l-6 3Z" fill="#eed699" />
      <path
        d="M15-11 23 4M23 4l1 12"
        fill="none"
        stroke="#b8c3a5"
        strokeWidth=".6"
      />
    </g>
  );
}

export function LandscapeArt({
  style = "mountain",
  className = "",
}: {
  style?: LandscapeStyle;
  className?: string;
}) {
  const id = useId().replaceAll(":", ""),
    water = style === "water",
    snow = style === "snow",
    city = style === "city" || style === "palace",
    ruins = style === "ruins",
    island = style === "island";
  return (
    <svg
      className={`landscape-art ${className}`}
      viewBox="0 0 320 175"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={`sky${id}`}
          x1="0"
          y1="0"
          x2="320"
          y2="175"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor={snow ? "#d7e4df" : water ? "#c7e0d6" : "#dbe3cf"} />
          <stop
            offset="1"
            stopColor={snow ? "#adbfb8" : water ? "#a4c7bd" : "#b9cbb1"}
          />
        </linearGradient>
      </defs>
      <path fill={`url(#sky${id})`} d="M0 0h320v175H0z" />
      <g stroke="#7f9c8618" strokeWidth=".5">
        {[30, 70, 110, 150, 190, 230, 270, 310].map((x) => (
          <path key={x} d={`M${x} 0v175`} />
        ))}
        {[30, 60, 90, 120, 150].map((y) => (
          <path key={y} d={`M0 ${y}h320`} />
        ))}
      </g>
      <circle cx="253" cy="32" r="15" fill="#efebc8" opacity=".7" />
      {!water && (
        <>
          <path
            d="M0 133 36 98 61 112 108 48 145 79 183 42 234 92 264 64 320 116v59H0Z"
            fill={snow ? "#c6d4cb" : "#a2b698"}
            opacity=".5"
          />
          <path
            d="m11 141 61-53 44 47 46-67 40 44 42-29 64 61-137 31Z"
            fill={snow ? "#a4bab1" : "#8da583"}
          />
          <path
            d="m72 88 11 44 33 3-44-47Zm90-20-6 64 46-20-40-44Zm82 15-7 54 71 7-64-61Z"
            fill={snow ? "#dbe5dc" : "#aabd99"}
          />
          <path d="m42 143 86-29 134 29-84 29Z" fill="#d2d0a7" />
          <path d="m42 143 86 29 134-29-84 26Z" fill="#a9b18c" />
          <path d="M0 158q62-14 124 0t196-5" stroke="#e7ead0" opacity=".5" />
        </>
      )}
      {(water || island) && (
        <g stroke="#eef2db" opacity=".65" strokeWidth=".8">
          {[90, 107, 125, 145, 163].map((y, i) => (
            <path
              key={y}
              d={`M${i % 2 ? 20 : -30} ${y}q40-12 80 0t80 0 80 0 80 0`}
            />
          ))}
          <path d="m82 116 31 12-10 7-24-11Z" fill="#7b7254" stroke="none" />
          <path d="M96 126V91l-16 30Z" fill="#f0e5bb" stroke="#9da68b" />
        </g>
      )}
      {water ? (
        <>
          <path
            d="M156 121c26-28 66-19 69 0s-30 35-49 20 18-34 33-21"
            stroke="#6b9f94"
            strokeWidth="2"
          />
          <path d="M142 121c8-41 87-41 99-4s-35 49-63 34" stroke="#83b2a2" />
          <path d="m257 112 15-32 22 37Z" fill="#93aa90" />
          <path d="m272 80-3 27 25 10Z" fill="#b5c5a8" />
        </>
      ) : city ? (
        <>
          <path d="m80 128 59-44 104 34v22l-64 33-99-27Z" fill="#9da788" />
          <path d="m80 128 59-44 104 34-64 36Z" fill="#d4d3b2" />
          <path
            d="m91 126 50-33 91 29-55 27Z"
            stroke="#84977c"
            strokeWidth="2"
          />
          {[0, 1, 2].map((i) => (
            <House key={i} x={111 + i * 28} y={118 + i * 3} s={0.6} />
          ))}
          <House x={137} y={96} s={1.25} roof="#4d7066" />
          {style === "palace" && (
            <>
              <House x={137} y={78} s={1.15} roof="#586d7b" />
              <House x={139} y={62} s={1} roof="#586d7b" />
            </>
          )}
          <House x={93} y={113} s={0.65} />
          <House x={204} y={123} s={0.65} />
        </>
      ) : ruins ? (
        <>
          <path d="m103 136 48-29 64 19-49 30Z" fill="#b3b899" />
          <path
            d="m132 125 7-4v-34l-7 3Zm31 10 8-5V95l-8 4Zm30-13 7-4V93l-7 4Z"
            fill="#8b9981"
          />
          <path d="m132 90 6-4 33 9-8 4Z" fill="#c4c8aa" />
          {[0, 1, 2, 3].map((i) => (
            <path
              key={i}
              d={`m${109 + i * 22} ${143 + (i % 2) * 5} 8-7 11 5-8 8Z`}
              fill="#939e84"
            />
          ))}
        </>
      ) : style === "village" ? (
        <>
          <path d="m69 147 43-23 37 11-44 25Z" fill="#98a565" />
          <path
            d="m81 143 34-17m-25 22 34-18m-26 23 35-19"
            stroke="#d1cf8d"
            strokeWidth="2"
          />
          <path
            d="M178 109q-28 24-3 38t-1 28"
            stroke="#83b1a0"
            strokeWidth="8"
          />
          <path d="m159 145 35-10" stroke="#b7a47b" strokeWidth="5" />
          <House x={99} y={116} s={0.75} />
          <House x={128} y={106} s={0.8} />
          <House x={196} y={129} s={0.7} />
        </>
      ) : (
        <>
          <House x={143} y={93} s={1.15} roof={snow ? "#657f83" : "#567a69"} />
          <House x={145} y={75} s={1.05} roof={snow ? "#657f83" : "#567a69"} />
          {island && <House x={147} y={59} s={0.9} />}
          <House x={109} y={124} s={0.7} />
          <path
            d="m150 128 17 9-20 13m-4-12 14 7m-19-4 14 7"
            stroke="#d8d4ac"
            strokeWidth="2"
          />
        </>
      )}
      {!water && (
        <g fill={snow ? "#6e8e83" : "#537e59"}>
          {[
            [52, 127],
            [67, 134],
            [91, 111],
            [244, 131],
            [262, 141],
            [230, 148],
          ].map(([x, y], i) => (
            <g key={i}>
              <path d={`m${x} ${y - 17} 7 16h-14Z`} />
              <path
                d={`M${x} ${y - 8}v16`}
                stroke="#6e7a57"
                strokeWidth="1.5"
              />
            </g>
          ))}
        </g>
      )}
      <path d="M6 173h308" stroke="#eff0d9" />
      <path
        d="M13 15h11m-5-5v10M297 153h11m-5-5v10"
        stroke="#66866e"
        strokeWidth=".6"
        opacity=".5"
      />
    </svg>
  );
}

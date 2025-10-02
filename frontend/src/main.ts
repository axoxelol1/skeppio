import "./style.css";
import { setup } from "./globe";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
    <canvas class="webgl"></canvas>
<div style="
  position: absolute;
  bottom: 6px;
  right: 8px;
  font-size: 12px;
  color: #aaa;
  font-family: sans-serif;
">
  Data from <a href="https://aisstream.io/" target="_blank" style="color:#aaa;">aisstream.io</a> <br/>
  Earth texture from
  <a href="https://www.solarsystemscope.com/textures/" target="_blank" style="color:#aaa;">Solar System Scope</a> (CC-BY 4.0)
</div>
`;

setup();

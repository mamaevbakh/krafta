module.exports = [
"[project]/node_modules/.pnpm/tactus@0.0.3/node_modules/tactus/dist/index.mjs [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "triggerHaptic",
    ()=>triggerHaptic
]);
const HAPTIC_ID = "___haptic-switch___";
const HAPTIC_DURATION_MS = 10;
function isIOS$1() {
    if ("TURBOPACK compile-time truthy", 1) {
        return false;
    }
    //TURBOPACK unreachable
    ;
    const iOSDevice = undefined;
    const iPadOS = undefined;
}
let inputElement = null;
let labelElement = null;
let isIOS = false;
function mount() {
    if (labelElement && inputElement) return;
    isIOS = isIOS$1();
    inputElement = document.querySelector(`#${HAPTIC_ID}`);
    labelElement = document.querySelector(`label[for="${HAPTIC_ID}"]`);
    if (inputElement && labelElement) return;
    inputElement = document.createElement("input");
    inputElement.type = "checkbox";
    inputElement.id = HAPTIC_ID;
    inputElement.setAttribute("switch", "");
    inputElement.style.display = "none";
    document.body.appendChild(inputElement);
    labelElement = document.createElement("label");
    labelElement.htmlFor = HAPTIC_ID;
    labelElement.style.display = "none";
    document.body.appendChild(labelElement);
}
if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
;
function triggerHaptic(duration = HAPTIC_DURATION_MS) {
    if ("TURBOPACK compile-time truthy", 1) return;
    //TURBOPACK unreachable
    ;
}
;
}),
];

//# sourceMappingURL=36170_tactus_dist_index_mjs_2ed999b5._.js.map
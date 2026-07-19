/* =========================================================================
   MODULE: ids.js
   Single shared id counter used for rooms/kitchens/bathrooms/presets so
   generated ids never collide within a running session.
   ========================================================================= */
let _rid = 0;
export const nextId = () => `r${++_rid}`;

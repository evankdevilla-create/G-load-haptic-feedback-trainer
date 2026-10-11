F-35 aircraft model slot
========================

The sim loads /models/f35.glb (this folder) if the file exists, and otherwise draws a
procedural F-35-style jet. To use the detailed model:

  1. Open https://sketchfab.com/3d-models/lockheed-martin-f35-lightning-ii-db911de503c74285a8d506951df786d6
     (a free Sketchfab login is needed to download).
  2. Download 3D Model -> glTF / "GLB" format.
  3. Save it as sim/public/models/f35.glb (if you get a zip, extract it and keep the .glb;
     a .gltf with separate files must be re-exported as a single .glb).
  4. Reload the sim. If the jet flies backwards, change MODEL_YAW in src/scene/Jet.tsx
     (Math.PI <-> 0).

License and credit (required by CC BY 4.0)
------------------------------------------
Model:   "Lockheed Martin F35 Lightning II" by andertan
Source:  https://sketchfab.com/3d-models/lockheed-martin-f35-lightning-ii-db911de503c74285a8d506951df786d6
License: Creative Commons Attribution 4.0 International (https://creativecommons.org/licenses/by/4.0/)
Changes: scaled and re-oriented at load time; no edits to the mesh.
Verified on the Sketchfab page on 2026-10-11: license CC Attribution, 83.2k triangles,
described by the uploader as their own work.

The sim shows this credit in its menu when f35.glb is present. Keep it if you ship the file.


Credit line shown in the menu
-----------------------------
The menu prints the contents of credit.txt (in this folder) under the key list. Put the
credit for whichever model you use in that file. credit.txt and *.glb are gitignored here
on purpose: do not commit a model whose license is non-commercial / personal-use only.

Account-free copy (NOT license-clean for a public hackathon entry)
-------------------------------------------------------------------
The only account-free copies found are mirrors of bohmerang's "F-35 Lightning II (Fighter Jet,
Free)", CC BY-NC-SA 4.0, whose page says "Can't be used in any commercial work, only for
personal use!". It works for flying locally; showing it to judges or publishing it is your
call on that license. The andertan model above (CC BY 4.0) is the clean option.

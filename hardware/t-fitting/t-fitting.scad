// socket T for tubing with 3 mm OUTER diameter. tube pushes INTO each arm. mm.
$fn = 48;
tube_od = 3;
fit     = -0.1;   // press fit; set to +0.1 if the tube won't go in
bore    = 1.4;    // air path, keep under the tube's ID
socket  = 8;      // tube insertion depth
wall    = 2;
arm     = socket + 3;
od      = tube_od + wall * 2;

module arm_solid() { cylinder(h = arm, d = od); }
module arm_hole()  {
  cylinder(h = socket, d = tube_od + fit);
  cylinder(h = arm + 1, d = bore);
}

difference() {
  union() {
    sphere(d = od);
    rotate([0, 90, 0])  arm_solid();
    rotate([0, -90, 0]) arm_solid();
    rotate([-90, 0, 0]) arm_solid();
  }
  // sockets open at the arm ends, so flip each hole to start from the tip
  for (r = [[0, 90, 0], [0, -90, 0], [-90, 0, 0]])
    rotate(r) translate([0, 0, arm - socket]) arm_hole();
  // center bore joining the three arms
  rotate([0, 90, 0]) cylinder(h = arm * 2, d = bore, center = true);
  rotate([-90, 0, 0]) cylinder(h = arm, d = bore);
}

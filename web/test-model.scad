bays = 3; // [1:1:5] // Number of horizontal bays in the deck
bay_size_hp = 35; // [35:35:140] // Width of outer bays in HP (multiples of 4U equivalent ≈ 35 HP)
bay_mid_hp = 35; // [35:35:140] // Width of center bay in HP (multiples of 4U equivalent ≈ 35 HP)
bay_size_u = 4; // [4:4:20] // Vertical height of all bays (multiples of 4U only)

// Keyboard Section: Optional full-width keyboard area at the bottom
keyboard_bay = true; // [false, true] // Include a full-width keyboard bay below the main bays
keyboard_bay_u = 4; // [4:4:12] // Height of keyboard bay (multiples of 4U only)

// Visualization
show_bay_panels = false; // [false, true] // Show transparent MakerPanel overlays for bay layout verification
show_profile_screw_holes = true; // [false, true] // Show screw holes on profile bottom lips

/* [Part Selection] */
// Which part to render
part = "assembly"; // [assembly, t_edge, t_edge_half, t_edge_debug, t_generic, t_generic_debug, mid, edge, corner, bay_divider_test, framework_mid_t, framework_keyboard_mid_t, framework_right_side, framework_corner_tr, bottom_skin_2d, bottom_skin_3d]
t_edge_half_side = "left"; // [left, right]

// Base cube
cube([width, height, depth], center=true);

// Hole through top
translate([0, 0, 0])
cylinder(r=radius, h=depth+2, center=true);

// Corner cylinders
translate([width/2-2, height/2-2, 0])
cylinder(r=1, h=depth, center=true);

translate([-width/2+2, height/2-2, 0])
cylinder(r=1, h=depth, center=true);

translate([width/2-2, -height/2+2, 0])
cylinder(r=1, h=depth, center=true);

translate([-width/2+2, -height/2+2, 0])
cylinder(r=1, h=depth, center=true);

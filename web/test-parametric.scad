// Test OpenSCAD with customizer parameters
// Size parameters
length = 20;    // [10:50]
width = 15;     // [10:50]
height = 25;    // [10:50]

// Shape selection
shape = "cube"; // [cube, sphere, cylinder]

// Colors
color_r = 0.8;  // [0:0.1:1]
color_g = 0.2;  // [0:0.1:1]
color_b = 0.5;  // [0:0.1:1]

// Main geometry
if (shape == "cube") {
    color([color_r, color_g, color_b]) 
    cube([length, width, height], center=true);
} else if (shape == "sphere") {
    color([color_r, color_g, color_b]) 
    sphere(r=max(length, width, height)/2);
} else if (shape == "cylinder") {
    color([color_r, color_g, color_b]) 
    cylinder(h=height, r=min(length, width)/2, center=true);
}

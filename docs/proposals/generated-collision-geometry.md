# Collision geometry generated from the aircraft's mesh

Status: Proposed, nothing built
Date: 2026-10-05
Scope: 0SFS body collision (`src/flight/physics/collisionGeometry.ts`,
`src/flight/physics/visibleMeshCollision.ts`), the Debug tab's collision overlay,
and the structure contacts in the aircraft packages. The Vision Jet first.

## Where it stands

- Body collision is a short list of points per airframe, swept between physics
  steps against the visible map ([visible-mesh-flight-collision.md](visible-mesh-flight-collision.md),
  Stage 2). The Vision Jet's six were read off a three-view
  (`SF50_BODY_COLLISION_PROBES`). Every other airframe gets five generic points
  (`BODY_COLLISION_PROBES`). Nothing checks either list against the mesh.
- The jet's points are fixed offsets from its empty CG. As fuel moves the CG, the
  points move with it, and so shift against the airframe. The C172's ground
  contacts are kept in structural inches and converted with the live CG each
  update (`groundContactBodyPosition`), which is the right way.
- The SF50 packages declare three `BOGEY` contacts and no `STRUCTURE` contacts.
  The C172 declares four structure contacts: a nose skid, a tail skid and both
  wing tips. A jet whose wing tip or tail touches the runway never reaches
  JSBSim's ground reactions. Only the swept points see it, and they answer with
  a rewind and a bounce, not a contact force with friction.
- The Debug overlay draws the generic points and the C172's contacts for every
  aircraft. That fault is fixed separately (TODO.md, "collision"), and before
  this work, because it is how this work gets looked at.
- Every new aircraft means another hand-written list.

## The approach

The aircraft's own mesh is the only source. A script reads the mesh and writes
the aircraft's collision data, and the physics and the overlay both read that
file. Nobody writes points by hand. Adding an aircraft means running the script
and committing what it writes.

This stays in 0SFS. A mesh-to-points generator would still be correct with no
aircraft in the scene, but no globe application wants collision proxies for a
model. Like the phone remote, it is generic code that serves a flight feature.

### What to generate

1. **Ranked points.** Against flat ground, at any attitude, the first point of
   a rigid body to touch is a vertex of its convex hull. So the candidates are
   the hull's vertices, ranked greedily. The first are the extremes: nose, tail,
   wing tips, fin tips, belly. Each one after that is the vertex that most
   reduces the **sink depth**.

   The sink depth of the first N points is the largest, over every direction
   *d*, of how much further the mesh reaches along *d* than any of the N points
   does: `max over d of (h_mesh(d) − h_N(d))`, where *h* is the support
   function, the furthest extent along *d*. Physically, it is how far the
   aircraft can sink into flat ground, at its worst attitude, before one of the
   N points touches. It is in metres and does not depend on attitude. Offline,
   sampling directions densely computes it closely enough.

   The file keeps the whole ranked list, with the sink depth of each prefix.
   The runtime takes the first N, so the budget can change while flying without
   generating anything again, the way a ladder of detail levels works.

2. **Leading edges, if measurement asks for them.** Points miss a pole or a
   building corner that meets the wing between two of them. Rays along the
   leading edges of the wing and tail, cast each step in the current pose,
   catch anything that crosses them. Each costs one ray, counted in the same
   budget. Measure first how often the existing Stage 2 scenarios miss a hit
   between points.

3. **Structure contacts for the runway.** The points that can touch a runway in
   an ordinary mishap are the wing tips, the tail, the nose, and the belly with
   the gear up. They should also be written as JSBSim `STRUCTURE` contacts, as
   the C172 has them, so a wing tip in a crosswind landing gets JSBSim's spring
   and friction rather than a rewind and a bounce. The swept points stay for
   buildings and trees. This is a recommendation. Two things want deciding with
   [ground-contact.md](../ground-contact.md): whether the packages take
   generated contacts, and how they stay in step with the mesh. One way is a
   test that the XML's contacts equal the generated ones.

4. **Convex hulls, later.** Generate these only if a shape-cast backend is ever
   adopted (Rapier or Jolt, [collision-compute-comparison.md](../collision-compute-comparison.md)).
   The same script would then emit a convex decomposition in the CoACD or
   V-HACD style, with a budget for the hull count and the vertices per hull.

### Which mesh

- Use our own highest level, `lod3`, never the level on screen. The physics must
  not change when someone picks another level of detail. The opt-in HD level is
  also modelled gear-up and is 3% short.
- Leave out the parts JSBSim already handles. The wheels and gear legs are
  `BOGEY` contacts. Find them by node name; the gear rig names its parts
  ([aircraft-assets.md](../aircraft-assets.md), "Retractable landing gear").
- Take control surfaces and flaps at their neutral positions, and record that
  you did.

### Frame

Store the points in JSBSim structural inches (x aft, y right, z up), like the
contacts, and convert them with the live CG on every step, as
`groundContactBodyPosition` already does for the C172.

The mapping from the mesh to structural inches is one datum per aircraft. Check
it: the lowest point of each wheel in the mesh has to land on the package's
`BOGEY` contact for that wheel, within the gear's static compression. A wrong
mapping would otherwise go unnoticed.

### Where it runs

Run the generator offline, as a Node script in `scripts/`, once per change to
the mesh. Commit its output beside the aircraft's catalog entry. Add a test that
fails when the mesh's hash differs from the hash the output records, so a mesh
exported again cannot silently keep old collision data. Like every script, its
default output goes to a dated folder; the committed file is written with an
explicit output path.

Offline because the result is the same on every run and its diff can be
reviewed, nothing is computed on a phone at load, and the same script runs on a
FlightGear import or a third-party mesh.

It needs only the positions and node transforms out of the GLB. Babylon's
loader is already a dependency; a small GLB reader is the other choice. A 3D
convex hull needs quickhull or similar. Check the licence of anything you add
against THIRD_PARTY_LICENSES.md.

### The budget is a setting

Add "Body collision points per physics step" to the Ground interaction section,
its one home. Its unit is a count. Its bounds are 0 to the number generated.

Today's cap is five ([visible-mesh-flight-collision.md](visible-mesh-flight-collision.md),
"Performance budget"). Measure the cost of each point at 120 Hz over Google 3D
tiles with Debug → Frame budget, and choose the default from that
measurement, saying why. Beside the control, show the sink depth at the
current count in metres, read from the file.

### The overlay

The overlay draws exactly what the physics reads:

- the first N points, numbered by rank;
- the contacts of the package that is loaded;
- the CG;
- optionally, the convex hull of the active points, drawn as a translucent
  wireframe over the mesh, so the parts nothing covers show.

The legend counts come from the data.

## Checks

- Every vertex of the mesh lies inside the full hull. The extremes come out
  where they should: the nose furthest forward, the wing tips furthest out.
- The sink depth falls as N grows and is zero once every hull vertex is in.
- The wheels land on the `BOGEY` contacts.
- The mesh hash matches the one the output records.
- One test shows that the overlay and the physics read the same array.
- The existing Stage 2 tests pass with the generated points: road, roof, wall
  or tree proxy, grazing hit and no hit.

## Order

1. The overlay draws what the physics uses (TODO.md, "collision"). It does not
   depend on anything below.
2. The generator, for the jet first: points only, in the structural frame,
   with the checks above. It replaces `SF50_BODY_COLLISION_PROBES`.
3. The budget setting, and the overlay showing rank and sink depth.
4. Structure contacts in the jet's packages.
5. The C172, which is a matter of running the script. It is out of scope until
   the jet's is done.
6. Leading edges, if measurement shows points missing hits.

# Reporting bugs

Open **Bug report** from the tab strip's **+**, or use the 🐞 icon on the bottom-left
toolbar when it has room. Give the issue a title and describe what
happened, then review the activity report already filled in. Download the report as a
`.txt` file and open the GitHub issue draft. GitHub handles sign-in if needed. Attach the
downloaded file to the draft and submit the issue in `0SFS/0SFS.github.io`. There is no
report text to paste.

The shared FOSS Earth report includes the running build and component revisions, browser,
viewport and device capabilities, requested and active renderer, available GPU details,
effective settings, warnings and errors, retained activity, and the previous visit's trail.
0SFS adds the aircraft and its visual generation and detail, model status, camera view,
simulation state and physics fault, and JSBSim's package and engine/SDK commits. Loading
starts using the same activity capture before the flight module is downloaded. The report
does not switch on flight recording or performance traces.

If the flight stops before you can reach Settings, open `/fly/?report` on the same site.
That page reads the previous visit's retained trail and offers the report without starting
the renderer or flight simulation.

Known secret settings, recognized credentials, email addresses, URL queries and fragments
are removed from the public draft. Coordinate settings are omitted. Review the draft and
remove any other personal details before continuing; activity and error messages can
contain information the automatic redactor cannot recognize. The report stays on this
device as a downloadable file. The issue title and description are passed to GitHub when
the draft opens; the report reaches GitHub when you attach the file, and that attachment
is publicly accessible from then on. The issue is published when you submit it.

This flow runs in the static app. FOSS Earth owns the report UI and file generation;
0SFS consumes its public diagnostics and shell exports. The repository recorded by the
build selects the issue destination. The Bug report tab is the form's one home, and the
toolbar icon shows or closes that tab. Interface → Toolbar controls the icon: **Auto**
shows it when its measured width fits beside the flight controls and map attribution,
**On** keeps it visible, and **Off** hides the shortcut. Custom priorities change its
position. The tab stays available under **+**. Settings → Diagnostics keeps the activity
trail settings and **Copy report**.

After an issue is filed, give an agent its issue URL, or its repository and issue number,
for example `0SFS/0SFS.github.io#123`. The component revisions and attachment help it investigate the code
that actually ran. The agent still fixes globe defects in FOSS Earth and flight defects in
0SFS, following the [repository boundary](foss-earth-relationship.md).

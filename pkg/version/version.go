package version

import (
	"encoding/json"
	"fmt"
	"runtime"
	"runtime/debug"
)

var (
	// Version is the current semver release (e.g. "0.1.0") or "dev".
	// Overridden at build time via -ldflags "-X github.com/divmora/owlflow/pkg/version.Version=...".
	Version = "dev"

	// GitCommit is the git commit SHA of the build.
	// Overridden at build time via -ldflags "-X github.com/divmora/owlflow/pkg/version.GitCommit=...".
	GitCommit = "none"

	// BuildDate is the RFC3339 formatted build timestamp.
	// Overridden at build time via -ldflags "-X github.com/divmora/owlflow/pkg/version.BuildDate=...".
	BuildDate = "unknown"

	// GoVersion is the Go compiler version used to build the binary.
	GoVersion = runtime.Version()
)

// Info encapsulates complete build and environment version metadata.
type Info struct {
	Version   string `json:"version"`
	GitCommit string `json:"git_commit"`
	BuildDate string `json:"build_date"`
	GoVersion string `json:"go_version"`
	Compiler  string `json:"compiler"`
	Platform  string `json:"platform"`
}

// Get returns populated Info metadata, attempting runtime/debug introspection if flags were omitted.
func Get() Info {
	v := Version
	commit := GitCommit
	date := BuildDate

	if info, ok := debug.ReadBuildInfo(); ok {
		if v == "dev" && info.Main.Version != "" && info.Main.Version != "(devel)" {
			v = info.Main.Version
		}
		for _, s := range info.Settings {
			if s.Key == "vcs.revision" && commit == "none" {
				commit = s.Value
			}
			if s.Key == "vcs.time" && date == "unknown" {
				date = s.Value
			}
		}
	}

	return Info{
		Version:   v,
		GitCommit: commit,
		BuildDate: date,
		GoVersion: GoVersion,
		Compiler:  runtime.Compiler,
		Platform:  fmt.Sprintf("%s/%s", runtime.GOOS, runtime.GOARCH),
	}
}

// String returns a human-readable single-line summary of the version metadata.
func (i Info) String() string {
	return fmt.Sprintf("OwlFlow %s (commit: %s, built: %s, %s, %s)",
		i.Version, i.GitCommit, i.BuildDate, i.GoVersion, i.Platform)
}

// JSON returns a formatted JSON string of the version metadata.
func (i Info) JSON() (string, error) {
	bytes, err := json.MarshalIndent(i, "", "  ")
	if err != nil {
		return "", err
	}
	return string(bytes), nil
}

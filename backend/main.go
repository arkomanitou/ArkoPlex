package main

import (
	"log/slog"
	"os"
	"pelagica-backend/appconfig"
	"pelagica-backend/collector"
	"pelagica-backend/handlers"
	"pelagica-backend/logging"
	"pelagica-backend/services"

	"github.com/gofiber/fiber/v3"
)

func getPort() string {
	port := os.Getenv("PORT")
	if port == "" {
		port = "4321"
	}
	return ":" + port
}

func main() {
	logging.Setup()

	app := fiber.New()
	appconfig.Setup(app)

	job := collector.RegisterStatsJob()
	if job != nil {
		defer job.Stop()
	}

	services.InitStudiosDB()
	studiosDBJob := services.RegisterStudiosDBRefreshJob()
	if studiosDBJob != nil {
		defer studiosDBJob.Stop()
	}

	registerRoutes(app)

	slog.Info("Server starting", "port", getPort(), "fiber", fiber.Version)
	if err := app.Listen(getPort(), fiber.ListenConfig{
		DisableStartupMessage: true,
	}); err != nil {
		slog.Error("Server failed", "error", err)
		os.Exit(1)
	}
}

func registerRoutes(app *fiber.App) {
	api := app.Group("/api")

	api.Get("/config", handlers.GetConfig)
	api.Get("/server-address", handlers.GetServerAddress)
	api.Get("/arkoplex/config", handlers.GetArkoPlexConfig)
	// Local configuration always requires verified admin access, even in dev mode.
	api.Put("/arkoplex/config", handlers.AuthMiddleware, handlers.PutArkoPlexConfig)
	api.Get("/arkoplex/branding/logo/:mode", handlers.GetArkoPlexLogo)
	api.Put("/arkoplex/branding/logo/:mode", handlers.AuthMiddleware, handlers.PutArkoPlexLogo)
	api.Get("/health", func(c fiber.Ctx) error { return c.JSON(fiber.Map{"status": "ok", "app": "ArkoPlex"}) })
	api.Get("/branding/logo/:mode", handlers.GetBrandingLogo)

	api.Get("/themes", handlers.GetThemes)
	api.Post("/themes", handlers.AuthMiddleware, handlers.CreateTheme)
	api.Get("/themes/:id", handlers.GetTheme)
	api.Put("/themes/:id", handlers.AuthMiddleware, handlers.UpdateTheme)
	api.Delete("/themes/:id", handlers.AuthMiddleware, handlers.DeleteTheme)
	api.Post("/themes/:id/install", handlers.AuthMiddleware, handlers.InstallTheme)

	api.Get("/studios", handlers.GetStudios)
	api.Get("/studios/health", handlers.GetStudiosHealth)
	api.Get("/studios/:name/logo", handlers.GetStudioLogo)

	api.Get("/stats-consent", handlers.GetStatsConsent)
	api.Post("/stats-consent", handlers.AuthMiddleware, handlers.PostStatsConsent)

	api.Post("/seerr/login", handlers.SeerLogin)
	api.Post("/seerr/logout", handlers.SeerLogout)
	api.Post("/seerr/quickconnect/initiate", handlers.SeerQuickConnectInitiate)
	api.Post("/seerr/quickconnect/authenticate", handlers.SeerQuickConnectAuthenticate)
	api.Get("/seerr/quickconnect/supported", handlers.GetSeerQuickConnectSupported)
	api.Get("/seerr/movie/:tmdbId/recommendations", handlers.GetSeerMovieRecommendations)
	api.Get("/seerr/tv/:tvId/recommendations", handlers.GetSeerTvRecommendations)
	api.Get("/seerr/movie/:tmdbId", handlers.GetSeerMovieDetails)
	api.Get("/seerr/tv/:tvId", handlers.GetSeerTvDetails)
	api.Get("/seerr/person/:personId/combined_credits", handlers.GetSeerPersonCombinedCredits)
	api.Post("/seerr/request", handlers.PostSeerRequest)
	api.Get("/seerr/search", handlers.GetSeerSearch)
	api.Get("/seerr/status", handlers.GetSeerrStatus)
	api.Get("/seerr/discover/trending", handlers.GetSeerDiscoverTrending)
	api.Get("/seerr/discover/movies", handlers.GetSeerDiscoverMovies)
	api.Get("/seerr/discover/tv", handlers.GetSeerDiscoverTv)
}

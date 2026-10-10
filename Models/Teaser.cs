namespace MyWebPortfolio.Models;

// One card in the home-screen summary ("I MAKE ..."). Target = the id of the screen it jumps to.
public record Teaser(string Word, string Target, string Blurb, string[] Top);

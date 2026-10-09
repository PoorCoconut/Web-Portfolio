namespace MyWebPortfolio.Models
{
    // INHERITED CLASSES
    public class SoftwareProject : Project
    {
        public string Language { get; set; } = string.Empty;
        public string GitHubUrl { get; set; } = string.Empty;
    }
}

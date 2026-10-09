namespace MyWebPortfolio.Models
{
    // INHERITED CLASSES
    public class MusicTrack : Project
    {
        public string AudioFilePath { get; set; } = string.Empty;
        public int PlayCount { get; set; }

        public void PlayAudio()
        {
            throw new NotImplementedException();
        }
    }
}

using System;

namespace MyWebPortfolio.Models
{
    // BASE CLASS
    public class Project
    {
        public int Id { get; set; }
        public string Title { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public DateTime DatePublished { get; set; }

        public virtual string GetDetails()
        {
            return $"{Title}: {Description}";
        }
    }
}

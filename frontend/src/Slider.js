import ReactSlider from "react-slider";
    
const Slider = (name) => {
    return (
      <ReactSlider
       className={name}
       trackClassName="customSlider-track"
       thumbClassName="customSlider-thumb"
      />
    );
  };

export default Slider;